import asyncio
import os
import json
import re
import sys
import subprocess
from contextlib import asynccontextmanager
from typing import List, Dict, Any, Optional
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from mcp.shared.message import SessionMessage
import mcp.types as types
import anyio
from anyio.streams.text import TextReceiveStream
from anyio.streams.memory import MemoryObjectSendStream, MemoryObjectReceiveStream
import logging
import math
from llm_config import get_llm
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import JsonOutputParser
from langchain_core.tools import StructuredTool
from schema_adapter import schema_adapter  # 🔥 NEW: Config-driven schema patches

CONFIG_FILE = os.path.join(os.path.dirname(__file__), "mcp_config.json")

logger = logging.getLogger(__name__)

class AuthRequiredError(Exception):
    """Raised when the MCP server requests authentication via a URL."""
    def __init__(self, url: str):
        self.url = url
        super().__init__(f"Authentication required: {url}")

def get_default_environment() -> dict[str, str]:
    env = os.environ.copy()
    return env

async def _create_process_linux(command, args, env, cwd):
    return await anyio.open_process(
        [command, *args],
        env=env,
        stderr=subprocess.PIPE, # Capture stderr for Auth URL
        cwd=cwd,
        start_new_session=True,
    )

@asynccontextmanager
async def auth_aware_stdio_client(server: StdioServerParameters):
    """
    Custom client transport for stdio that captures stderr to look for OAuth URLs.
    """
    read_stream_writer: MemoryObjectSendStream[SessionMessage | Exception]
    read_stream: MemoryObjectReceiveStream[SessionMessage | Exception]
    write_stream: MemoryObjectSendStream[SessionMessage]
    write_stream_reader: MemoryObjectReceiveStream[SessionMessage]

    read_stream_writer, read_stream = anyio.create_memory_object_stream(math.inf)
    write_stream, write_stream_reader = anyio.create_memory_object_stream(math.inf)

    try:
        # Use our simplified process creator for Linux
        process = await _create_process_linux(
            command=server.command,
            args=server.args,
            env=({**get_default_environment(), **(server.env or {})}),
            cwd=server.cwd
        )
    except OSError:
        await read_stream.aclose()
        await write_stream.aclose()
        await read_stream_writer.aclose()
        await write_stream_reader.aclose()
        raise

    async def stdout_reader():
        assert process.stdout, "Opened process is missing stdout"
        try:
            async with read_stream_writer:
                buffer = ""
                async for chunk in TextReceiveStream(process.stdout, encoding=server.encoding):
                    lines = (buffer + chunk).split("\n")
                    buffer = lines.pop()
                    for line in lines:
                        if not line.strip(): continue
                        try:
                            # Try to parse as JSON-RPC
                            message = types.JSONRPCMessage.model_validate_json(line)
                            session_message = SessionMessage(message)
                            await read_stream_writer.send(session_message)
                        except Exception:
                            # Ignore non-JSON output in stdout
                            pass
        except anyio.ClosedResourceError:
            pass

    async def stderr_reader():
        assert process.stderr, "Opened process is missing stderr"
        try:
            async for line in TextReceiveStream(process.stderr, encoding=server.encoding):
                # Check for OAuth URL pattern
                # Pattern: https://.../authorize?...
                match = re.search(r'(https://[^\s]+/authorize\?[^\s]+)', line)
                if match:
                    auth_url = match.group(1)
                    # We found the Auth URL! Raise exception to break the workflow and return URL
                    raise AuthRequiredError(auth_url)
                
                # Also print to regular stderr so it's visible in logs
                sys.stderr.write(line)
                sys.stderr.flush()
        except anyio.ClosedResourceError:
            pass
        except AuthRequiredError:
            # Re-raise to be caught by the task group
            raise

    async def stdin_writer():
        assert process.stdin, "Opened process is missing stdin"
        try:
            async with write_stream_reader:
                async for session_message in write_stream_reader:
                    json_str = session_message.message.model_dump_json(by_alias=True, exclude_none=True)
                    await process.stdin.send(
                        (json_str + "\n").encode(encoding=server.encoding)
                    )
        except anyio.ClosedResourceError:
            pass

    async with anyio.create_task_group() as tg:
        tg.start_soon(stdout_reader)
        tg.start_soon(stdin_writer)
        tg.start_soon(stderr_reader)
        
        try:
            yield read_stream, write_stream
        except Exception as e:
            logger.error(f"Error in auth_aware_stdio_client stream yield: {e}")
            raise
        finally:
            # Cleanup
            if process.stdin:
                try:
                    await process.stdin.aclose()
                except Exception:
                    pass
            
            # We don't wait for process to exit if we are interrupting for Auth
            # But normally we should cleanup.
            # For now, just close streams.
            await read_stream.aclose()
            await write_stream.aclose()
            await read_stream_writer.aclose()
            await write_stream_reader.aclose() 
            
            # Ideally we should terminate process but mcp-remote might need to stay alive?
            # Actually if we found Auth URL, we WANT to exit this session so we can report back to frontend.
            # The background daemon of mcp-remote keeps running.
            try:
                # Log termination
                logger.info(f"Terminating process {process.pid} for command {server.command}")
                process.terminate()
            except Exception as e:
                logger.warning(f"Error terminating process: {e}")

class McpClient:
    def __init__(self):
        self.servers: List[Dict[str, Any]] = []
        self.load_config()
        self.active_sessions: Dict[str, ClientSession] = {}
        self.session_tasks: Dict[str, asyncio.Task] = {}
        self.init_events: Dict[str, asyncio.Event] = {}
        # Per-server locks to prevent race conditions during connection (Priority 1: Infrastructure)
        self._session_locks: Dict[str, asyncio.Lock] = {}
        
        # Tools caching (Priority 2)
        self._tools_cache: Dict[str, Dict[str, Any]] = {}  # {server_name: {tools: [], timestamp: float}}
        self._cache_ttl: int = 300  # Cache TTL in seconds (5 minutes)

    def load_config(self):
        """Load server configuration from JSON file."""
        self.servers = []
        if os.path.exists(CONFIG_FILE):
             try:
                 with open(CONFIG_FILE, 'r') as f:
                     config = json.load(f)
                     for server_conf in config:
                         self.servers.append(server_conf)
             except Exception as e:
                 print(f"Error loading MCP config: {e}")
                 
        # ALWAYS ON: Force include banking-mcp if missing
        if not any(s.get("name") == "banking-mcp" for s in self.servers):
            self.servers.append({
                "name": "banking-mcp",
                "command": "python",
                "args": ["banking_mcp/server.py"],
                "env": {}
            })

    def save_config(self):
        """Save server configuration to JSON file."""
        try:
            with open(CONFIG_FILE, 'w') as f:
                json.dump(self.servers, f, indent=2)
        except Exception as e:
            print(f"Error saving MCP config: {e}")

    async def _run_session_loop(self, server_config: Dict[str, Any]):
        name = server_config["name"]
        command = server_config.get("command")
        args = server_config.get("args", [])
        env = server_config.get("env", {})
        
        logger.info(f"Starting session loop for {name}")
        
        # Determine the project root (CWD) for local servers
        project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
        cwd = server_config.get("cwd", project_root)
        
        try:
             params = StdioServerParameters(command=command, args=args, env=env)
             # Manually attach cwd if it's not a standard field (auth_aware_stdio_client uses it)
             params.cwd = cwd
             
             # Use auth_aware_stdio_client locally or remote to handle potential auth requests anytime
             async with auth_aware_stdio_client(params) as (read, write):
                 async with ClientSession(read, write) as session:
                     await session.initialize()
                     self.active_sessions[name] = session
                     
                     logger.info(f"Session {name} initialized and active")

                     # Signal that init is done
                     if name in self.init_events:
                         self.init_events[name].set()
                     
                     # Keep alive
                     # Keep session alive until explicitly stopped
                     self.session_tasks[name] = asyncio.current_task()
                     await asyncio.Event().wait()
        except asyncio.CancelledError:
            logger.info(f"Session {name} loop cancelled")
        except Exception as e:
            # Unwrap ExceptionGroup for auth errors (Bug 5 fix)
            if type(e).__name__ == "ExceptionGroup":
                for err in e.exceptions:
                    if isinstance(err, AuthRequiredError):
                        logger.warning(f"Session {name} requires authentication: {err.url}")
                        print(f"Session {name} requires authentication: {err.url}")
                        return
            
            logger.error(f"Session {name} error in loop: {e}", exc_info=True)
            print(f"Session {name} error: {e}")
        finally:
             if name in self.active_sessions:
                 del self.active_sessions[name]
             logger.info(f"Session {name} stopped and removed from active sessions")
             print(f"Session {name} stopped")

    async def ensure_session(self, server_name: str) -> ClientSession:
        # 1. Fast path: check if active without lock
        if server_name in self.active_sessions:
            return self.active_sessions[server_name]
            
        # 2. Ensure lock exists for this server
        if server_name not in self._session_locks:
            self._session_locks[server_name] = asyncio.Lock()
            
        # 3. Acquire lock to serialize connection attempts (Race Condition Fix)
        async with self._session_locks[server_name]:
            # Double check inside lock
            if server_name in self.active_sessions:
                return self.active_sessions[server_name]

            # Check if server exists in config
            server_config = next((s for s in self.servers if s["name"] == server_name), None)
            if not server_config:
                raise ValueError(f"Server {server_name} not configured")
                
            # Start new session
            if server_name not in self.session_tasks or self.session_tasks[server_name].done():
                self.init_events[server_name] = asyncio.Event()
                self.session_tasks[server_name] = asyncio.create_task(self._run_session_loop(server_config))
                
            # Wait for init
            try:
                # Increased timeout to 300s to account for slow startups/remote auth/installs
                async with asyncio.timeout(300): 
                    await self.init_events[server_name].wait()
            except asyncio.TimeoutError:
                self.stop_session(server_name)
                raise TimeoutError(f"Timed out waiting for server {server_name} to connect")
                
            if server_name in self.active_sessions:
                return self.active_sessions[server_name]
            else:
                 raise ConnectionError(f"Failed to connect to server {server_name}")

    def stop_session(self, server_name: str):
        if server_name in self.session_tasks:
            self.session_tasks[server_name].cancel()
            del self.session_tasks[server_name]

    async def connect_to_server(self, name: str, command: str, args: List[str], env: Dict[str, str] = None):
        """
        Registers and connects to an MCP server via stdio.
        For remote servers, use: command="npx", args=["-y", "mcp-remote", "<URL>"]
        Headers can be passed via env dict.
        """
        # Remove existing if active or configured
        self.remove_server(name)

        server_config = {
            "name": name,
            "command": command,
            "args": args,
            "env": env or {}
        }
        
        self.servers.append(server_config)
        self.save_config()
        
        # Check if this is a remote server (mcp-remote)
        is_remote = command == "npx" and "mcp-remote" in args
        
        if is_remote:
            # Test connection immediately for remote servers using our custom auth-aware client
            try:
                project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
                params = StdioServerParameters(command=command, args=args, env=env)
                params.cwd = project_root
                # Use longer timeout for remote auth
                async with asyncio.timeout(60): 
                    async with auth_aware_stdio_client(params) as (read, write):
                        async with ClientSession(read, write) as session:
                            await session.initialize()
                            await session.list_tools()
                
                return True, "Connected successfully"
            except AuthRequiredError as e:
                # We captured the URL! Return it to the frontend via a special error message
                return False, f"AUTH_REQUIRED: {e.url}"
            except asyncio.TimeoutError:
                message = "Connection timed out. If you see an authentication request in your terminal, please complete it manually."
                return False, message
            except Exception as e:
                # Check for AuthRequiredError wrapped in ExceptionGroup (common in anyio)
                if type(e).__name__ == "ExceptionGroup":
                    for err in e.exceptions:
                        if isinstance(err, AuthRequiredError):
                            return False, f"AUTH_REQUIRED: {err.url}"
                            
                return False, f"Connection failed: {str(e)}"
        
        # Test connection immediately for local servers (with timeout)
        try:
            project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
            params = StdioServerParameters(command=command, args=args, env=env)
            params.cwd = project_root
            # Add 300 second timeout to prevent hanging (increased for npx installs)
            async with asyncio.timeout(300):
                async with stdio_client(params) as (read, write):
                    async with ClientSession(read, write) as session:
                        await session.initialize()
                        await session.list_tools()
            
            return True, "Connected successfully"
        except asyncio.TimeoutError:
            return False, "Connection timed out. Please verify the command and arguments are correct."
        except Exception as e:
            # Unpack ExceptionGroup if present (common in asyncio/anyio)
            if type(e).__name__ == "ExceptionGroup":
                errors = e.exceptions
                error_msgs = []
                for err in errors:
                    if hasattr(err, 'response') and hasattr(err.response, 'status_code'):
                         error_msgs.append(f"HTTP {err.response.status_code}: {err.response.reason_phrase if hasattr(err.response, 'reason_phrase') else str(err)}")
                    else:
                         error_msgs.append(str(err))
                return False, f"Connection failed: {'; '.join(error_msgs)}"
            
            return False, f"Connection failed: {str(e)}"



    async def list_tools(self, target_servers: List[str] = None) -> List[Dict[str, Any]]:
        """
        List tools from all connected servers with caching.
        If target_servers provided, only fetch/refresh from those.
        """
        import time
        all_tools = []
        current_time = time.time()
        
        # If target_servers is provided, only iterate over those
        # Otherwise iterate over all self.servers
        servers_to_query = self.servers
        if target_servers:
            # Filter configs by name
            servers_to_query = [s for s in self.servers if s["name"] in target_servers]

        for server in servers_to_query:
            try:
                server_name = server["name"]
                if not server.get("command"):
                     continue

                # Check cache first (Priority 2: Caching)
                if server_name in self._tools_cache:
                    cache_entry = self._tools_cache[server_name]
                    cache_age = current_time - cache_entry["timestamp"]
                    
                    if cache_age < self._cache_ttl:
                        # Cache is fresh, use it
                        print(f"[MCP CACHE] Using cached tools for {server_name} (age: {cache_age:.1f}s)")
                        all_tools.extend(cache_entry["tools"])
                        continue
                    else:
                        print(f"[MCP CACHE] Cache expired for {server_name} (age: {cache_age:.1f}s)")

                # Cache miss or expired - query the server
                print(f"[MCP] Fetching tools from {server_name}")
                session = await self.ensure_session(server_name)
                result = await session.list_tools()
                
                # Build tools list for this server
                server_tools = []
                for tool in result.tools:
                    tool_dict = tool.model_dump()
                    tool_dict["server"] = server_name
                    server_tools.append(tool_dict)
                
                # Cache the tools
                self._tools_cache[server_name] = {
                    "tools": server_tools,
                    "timestamp": current_time
                }
                
                all_tools.extend(server_tools)
            except Exception as e:
                # Log but continue if one server fails
                print(f"Error listing tools from {server['name']}: {e}")
        return all_tools
    
    def invalidate_tools_cache(self, server_name: str = None):
        """Invalidate tools cache for a specific server or all servers"""
        if server_name:
            if server_name in self._tools_cache:
                del self._tools_cache[server_name]
                print(f"[MCP CACHE] Invalidated cache for {server_name}")
        else:
            self._tools_cache.clear()
            print("[MCP CACHE] Invalidated all caches")
    
    def get_servers(self) -> List[Dict[str, Any]]:
        """Return list of configured servers."""
        return self.servers

    async def list_servers(self) -> List[Dict[str, Any]]:
        """
        List all configured servers.
        """
        return self.servers
    
    def remove_server(self, name: str):
        """Remove a server from configuration."""
        self.stop_session(name)
        self.servers = [s for s in self.servers if s["name"] != name]
        self.save_config()

    async def call_tool(self, server_name: str, tool_name: str, arguments: Dict[str, Any]):
        """
        Call a specific tool on a specific server.
        """
        # Polish: Intercept empty search queries (Infra Refinement)
        if "search" in tool_name.lower() and not str(arguments.get("query") or "").strip():
            print(f"[Skipping Tool] Empty query for {tool_name}")
            return "Skipped: Empty search query."

        try:
             session = await self.ensure_session(server_name)
             result = await session.call_tool(tool_name, arguments)
             # Convert Pydantic model to dict for JSON serialization
             if hasattr(result, "model_dump"):
                 return result.model_dump()
             elif hasattr(result, "dict"):
                 return result.dict()
             else:
                 return {
                     "content": [c.model_dump() if hasattr(c, "model_dump") else str(c) for c in result.content],
                     "isError": result.isError
                 }
        except ValueError as e:
             raise e
        except Exception as e:
             return f"Error calling tool {tool_name} on {server_name}: {e}"



    async def select_relevant_tools(self, query: str, tools: List[Dict[str, Any]], chat_history: List[Dict[str, str]] = None) -> List[Dict[str, Any]]:
        """
        Use an LLM to select relevant tools for the query to save tokens.
        Includes chat history for context.
        """
        if not tools:
            return []

        tool_descriptions = "\n".join([
            f"- {t['name']} (Server: {t.get('server')}): {t['description']}" 
            for t in tools
        ])

        llm = get_llm(temperature=0)
        
        prompt = ChatPromptTemplate.from_template(
            """You are a tool selection assistant. Your goal is to select the most relevant tools for a user's query from the available list.
            Selecting too many tools wastes resources. Select only what is strictly necessary.
            
            Context:
            {history_context}
            
            Current User Query: {query}
            
            Available Tools:
            {tool_descriptions}
            
            Return a JSON list of tool names that are relevant. Example: ["tool_a", "tool_b"].
            If the user is confirming a previous suggestion or asking to proceed, search the context for what tool they are confirming and select that.
            If no tools are relevant, return [].
            """
        )
        
        history_context = ""
        if chat_history:
            # Last 3 messages are usually enough for context
            context_msgs = chat_history[-3:]
            history_context = "\n".join([f"{m['role'].capitalize()}: {m['content']}" for m in context_msgs])

        chain = prompt | llm | JsonOutputParser()
        
        try:
            selected_names = await chain.ainvoke({
                "query": query, 
                "history_context": history_context,
                "tool_descriptions": tool_descriptions
            })
            relevant_tools = [t for t in tools if t['name'] in selected_names]
            return relevant_tools
        except Exception as e:
            print(f"Error selecting tools: {e}")
            # Fallback: return all tools if selection fails, or top N
            return tools[:5]
    def _create_tool_wrapper(self, tool_def: Dict[str, Any], server_name: str):
        """
        Creates a LangChain StructuredTool from an MCP tool definition.
        
        This is pure adapter logic:
        1. Apply LLM-friendly schema patches (via schema_adapter)
        2. Convert JSON Schema to Pydantic model
        3. Wrap with approval gate if needed
        
        No semantic mapping happens here — just format conversion.
        """
        print(f"[MCP Client] Creating wrapper for {tool_def['name']}")
        
        from pydantic import BaseModel, Field, create_model
        from typing import Any as AnyType, Optional as OptionalType
        from copy import deepcopy
        
        name = tool_def["name"]
        description = tool_def.get("description", "")
        original_input_schema = tool_def.get("inputSchema", {})
        
        # Keep original schema for reconstruction later
        original_schema = deepcopy(original_input_schema)
        
        # 🔥 NEW: Apply config-driven LLM-friendly patches
        # This replaces hardcoded schema modifications
        llm_schema = schema_adapter.apply_llm_patches(name, original_input_schema, server_name=server_name)
        
        # Convert JSON Schema to Pydantic model
        pydantic_model = None
        if llm_schema:
            # Define fields for Pydantic model
            fields = {}
            properties = llm_schema.get("properties", {})
            required_fields = set(llm_schema.get("required", []))

            for field_name, field_info in properties.items():
                field_type = field_info.get("type", "string")
                field_desc = field_info.get("description", "")
                
                # Map JSON Schema types to Python types
                type_mapping = {
                    "string": str,
                    "number": float,
                    "integer": int,
                    "boolean": bool,
                    "array": list,
                    "object": dict,
                }
                python_type = type_mapping.get(field_type, AnyType)
                
                # Handle optional vs required fields
                if field_name not in required_fields:
                    python_type = OptionalType[python_type]
                    default_value = None
                else:
                    default_value = ...
                
                fields[field_name] = (python_type, Field(default=default_value, description=field_desc))
            
            if fields:
                pydantic_model = create_model(f"{name}_input", **fields)
        
        # Mark destructive tools as requiring approval (Priority 6: Expanded keywords)
        # MUST be defined BEFORE tool_func_raw to avoid UnboundLocalError
        destructive_keywords = [
            'create', 'delete', 'update', 'move', 'remove', 'destroy',
            'archive', 'invite', 'publish', 'modify', 'write', 'send',
            'post', 'permission', 'grant', 'revoke', 'share', 'unshare',
            'execute', 'run', 'kill', 'terminate'
        ]
        requires_approval = any(keyword in name.lower() for keyword in destructive_keywords)
        
        async def tool_func_raw(**kwargs):
            """
            Raw tool execution without approval.
            
            Process:
            1. Strip null values (if configured)
            2. Reconstruct server-native format (via schema_adapter)
            3. Execute tool on MCP server
            """
            # Strip null values if configured
            if schema_adapter.global_rules.get("strip_null_values", True):
                cleaned_kwargs = {k: v for k, v in kwargs.items() if v is not None}
            else:
                cleaned_kwargs = dict(kwargs)
            
            # 🔥 NEW: Config-driven reconstruction
            # This replaces hardcoded location wrapping logic
            reconstructed_kwargs = schema_adapter.reconstruct_for_server(
                name, 
                cleaned_kwargs, 
                original_schema  # Pass original schema
            )

            result = await self.call_tool(server_name, name, reconstructed_kwargs)
            print(f"[MCP Client] Tool executed: {name} → {type(result)}")
            return result
        
        # Wrap with approval gate if needed
        async def tool_func(**kwargs):
            from approval_tools import ApprovalRequiredException
            from approval_handler import approval_manager
            
            # Filter out None values before creating approval request
            cleaned_kwargs = {k: v for k, v in kwargs.items() if v is not None}
            
            if requires_approval:
                # Removed: Global approval bypass - each execution needs unique approval (Priority 3)
                
                # Create approval request with tool function reference
                approval = approval_manager.create_approval_request(
                    tool_name=name,
                    tool_description=description,
                    server_name=server_name,
                    arguments=cleaned_kwargs,
                    timeout_seconds=120,  # 2 minute timeout
                    tool_func=tool_func_raw  # Pass the raw tool function for direct execution
                )
                
                # Raise exception with approval info (this pauses execution)
                raise ApprovalRequiredException(approval.to_dict())
            else:
                # Non-destructive tools execute immediately
                return await tool_func_raw(**kwargs)
        
        return StructuredTool.from_function(
            func=None,
            coroutine=tool_func,
            name=name,
            description=description,
            args_schema=pydantic_model,
            metadata={"server": server_name, "requires_approval": requires_approval}
        )

    async def get_langchain_tools(self, filter_names: List[str] = None, filter_servers: List[str] = None) -> List[StructuredTool]:
        """
        Get all tools as LangChain tools, optional filtering.
        """
        # PASS filter_servers down to list_tools optimizing fetch
        all_tools_data = await self.list_tools(target_servers=filter_servers)
        lc_tools = []
        
        for tool in all_tools_data:
            # Server name is embedded in tool dict by list_tools
            server_name = tool.get("server")
            
            # Filter by Server (Still useful to double check or if logic above is permissive)
            if filter_servers and server_name not in filter_servers:
                continue

            # Filter by Tool Name
            if filter_names and tool["name"] not in filter_names:
                continue
            
            # Create wrapper
            if server_name:
                lc_tools.append(self._create_tool_wrapper(tool, server_name))
        
        return lc_tools
