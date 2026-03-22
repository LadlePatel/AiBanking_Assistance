from flask import Flask, request, jsonify, g, stream_with_context, Response
from datetime import datetime
from flask_cors import CORS
from chroma_util import index_document_to_chroma, show_metadata, delete_doc_from_chroma
from pydantic_models import QueryInput, QueryResponse, DeleteFileRequest
from agent_engine import get_rag_chain, stream_rag_chain
from document_util import get_all_documents, insert_document_record, delete_document_record, get_document_by_filename
import os
import json
import logging
from mcp_client import McpClient
from llm_config import get_llm
from langchain_core.prompts import ChatPromptTemplate
from approval_handler import approval_manager

# Guard: Flask async routes require the [async] extra (pip install flask[async])
try:
    import asgiref  # noqa: F401 — pulled in by flask[async]
except ImportError:
    raise ImportError(
        "Async route handlers require 'flask[async]'. "
        "Run: pip install 'flask[async]'"
    )

import asyncio
import threading
import queue
import weakref

# Persistent Background Event Loop to handle all MCP and Langchain operations.
# This eliminates "Event loop is closed" errors caused by Flask tearing down request-local loops.
_shared_loop = asyncio.new_event_loop()
def _start_shared_loop(loop):
    asyncio.set_event_loop(loop)
    loop.run_forever()

threading.Thread(target=_start_shared_loop, args=(_shared_loop,), daemon=True).start()

def run_async(coro):
    """Run an async coroutine synchronously on the shared background loop."""
    future = asyncio.run_coroutine_threadsafe(coro, _shared_loop)
    return future.result()

# Initialize Flask app
app = Flask(__name__)
CORS(app)

# Initialize MCP Client globally
mcp_client = McpClient()

# Set up logging
logging.basicConfig(level=logging.ERROR,
                    format='%(asctime)s - %(levelname)s - %(message)s')

# Per-request tool-call list lives on Flask's g object (request-scoped, concurrency-safe).
# Access via _get_tool_calls() / _append_tool_call() helpers below.
# Global tracking for denial context (Single user assumption)
_last_denial = None


def _get_tool_calls() -> list:
    """Return the current request's tool-call list, creating it if needed."""
    if not hasattr(g, "_tool_calls"):
        g._tool_calls = []
    return g._tool_calls


def _append_tool_call(record: dict) -> None:
    """Append one tool-call record to the current request's list."""
    _get_tool_calls().append(record)

@app.route("/chat", methods=["POST", "OPTIONS"])
def chat():
    if request.method == 'OPTIONS':
        return '', 200
    # g._tool_calls is per-request; no reset needed (created fresh each request)
    
    # Cleanup expired approvals
    approval_manager.cleanup_expired()
    
    data = request.json
    user_input = data.get("message")
    chat_history = data.get("history", [])
    source_documents = data.get("source_documents", [])  # Get selected documents from frontend

    # Inject Denial Context if present
    global _last_denial
    if _last_denial:
        denial_note = f"\n\n[SYSTEM NOTE: The user explicitly DENIED the previous request to use the tool '{_last_denial['tool']}'. Do not propose it again immediately unless the user asks for it.]"
        # Append to the LAST user message (or system prompt)
        # Easiest is to append to user_input if it's a string
        if user_input:
            user_input += denial_note
        elif chat_history and chat_history[-1]['role'] == 'user':
            # Create a new dict instead of mutating in place
            updated_message = {
                'role': chat_history[-1]['role'],
                'content': chat_history[-1]['content'] + denial_note
            }
            chat_history[-1] = updated_message
             
        # Clear denial
        _last_denial = None

    # Execute chain/agent
    # Check for specific server selection, but always include banking-mcp
    selected_server_names = data.get("selected_servers", [])
    if "banking-mcp" not in selected_server_names:
        selected_server_names.append("banking-mcp")
    
    # Use get_langchain_tools which returns ready-to-use StructuredTool objects
    # Pass filter servers directly
    if selected_server_names:
        # If user selected specific servers, only get tools from those servers
        all_selected_tools = run_async(mcp_client.get_langchain_tools(filter_servers=selected_server_names))
        
        # 🔥 INTELLIGENT TOOL SELECTION: Don't initialize all tools
        # Use LLM to select only relevant tools based on user query
        if len(all_selected_tools) > 3:  # Only filter if we have many tools
            print(f"[TOOL SELECTION] Found {len(all_selected_tools)} tools, selecting relevant ones...")
            
            # Convert tools to dict format for selection
            tools_for_selection = [{
                "name": tool.name,
                "description": tool.description,
                "server": tool.metadata.get("server", "Unknown")
            } for tool in all_selected_tools]
            
            # Use LLM to select relevant tools
            relevant_tool_dicts = run_async(mcp_client.select_relevant_tools(user_input, tools_for_selection, chat_history=chat_history))
            relevant_tool_names = [t["name"] for t in relevant_tool_dicts]
            
            # Filter selected_tools to only include relevant ones
            selected_tools = [t for t in all_selected_tools if t.name in relevant_tool_names]
            print(f"[TOOL SELECTION] Selected {len(selected_tools)} relevant tools: {relevant_tool_names}")
        else:
            selected_tools = all_selected_tools
    else:
        # If no server selected, use empty (or all if we want auto-agent behavior)
        # Assuming explicit selection means "only these".
        selected_tools = []
    
    # Create a mapping of tool names to server names for later lookup
    tool_name_to_server = {tool.name: tool.metadata.get("server", "Unknown") for tool in selected_tools}
    
    # Streaming Generator
    async def generate():
        final_answer_accumulated = ""
        tool_calls_accumulated = []
        
        try:
            async for event in stream_rag_chain(user_input, chat_history, tools=selected_tools, documents=source_documents):
                
                # Handle Approval Request (Special Case: Stop stream and send specific JSON)
                if event["type"] == "approval_required":
                    approval_req = event["approval_request"]
                    approval_id = approval_req["approval_id"]
                     # Update the approval request with context
                    if approval_id in approval_manager.pending_approvals:
                        approval_manager.pending_approvals[approval_id].request_context = {
                            "user_input": user_input,
                            "chat_history": chat_history,
                            "selected_servers": selected_server_names,
                            "source_documents": source_documents
                        }
                    # Yield special event for frontend
                    yield f"data: {json.dumps({'type': 'approval_required', 'approval_request': approval_req})}\n\n"
                    return

                # Handle Standard Events
                if event["type"] == "token":
                    # Yield simple token string for easiest frontend consumption or full event
                    yield f"data: {json.dumps({'type': 'token', 'content': event['content']})}\n\n"
                    final_answer_accumulated += event['content']
                
                elif event["type"] == "tool_end":
                    # Capture tool calls but maybe don't stream them all visibly yet unless we want specific UI thinking state
                    # We can stream "Used tool X" notification
                    tool_data = event["data"]
                    
                    # Store for final payload (simplified)
                    # We would need to reconstruct the full tool call record logic here (status, isError check, etc)
                    # For V1 streaming, we might rely on the final "result" event if the chain provides it, 
                    # or we construct it here.
                    
                    # NOTE: "output" in tool_end from langchain might be a ToolMessage object or a list
                    output = tool_data.get("output")
                    
                    # 1. Extract content from LangChain message objects
                    if hasattr(output, 'content'):
                        output = output.content
                    
                    # 2. Handle lists (common in MCP/LangChain)
                    if isinstance(output, list):
                        parts = []
                        for item in output:
                            if isinstance(item, dict) and item.get("type") == "text":
                                parts.append(item.get("text", ""))
                            elif hasattr(item, 'content'):
                                parts.append(str(item.content))
                            else:
                                parts.append(str(item))
                        output = "\n".join(parts)
                        
                    # 3. Fallback for other non-serializable types
                    if not isinstance(output, (str, dict, list, int, float, bool, type(None))):
                        output = str(output)
                        
                    tool_name = tool_data.get("tool")
                    
                    status = "approved"
                    
                    # 4. Attempt to parse JSON string for MCP native Tool results
                    if isinstance(output, str) and output.strip().startswith("{"):
                        try:
                            parsed_json = json.loads(output)
                            if parsed_json.get("isError") is True:
                                status = "error"
                            # Extract clean text from MCP 'content' array
                            content_arr = parsed_json.get("content")
                            if isinstance(content_arr, list):
                                texts = [item.get("text", "") for item in content_arr if isinstance(item, dict) and item.get("type") == "text"]
                                if texts:
                                    output = "\n".join(texts)
                        except json.JSONDecodeError:
                            pass
                            
                    # 5. Standard fallback Error checks
                    if isinstance(output, str) and (output.strip().startswith("Error") or "Exception" in output): 
                        status = "error"
                    if isinstance(output, dict) and output.get("isError"): 
                        status = "error"
                    
                    server_name = tool_name_to_server.get(tool_name, "Unknown")
                    
                    rec = {
                        "tool": tool_name,
                        "server": server_name,
                        "status": status,
                        "result": output # Maybe too large to send?
                    }
                    tool_calls_accumulated.append(rec)
                    
                    yield f"data: {json.dumps({'type': 'tool_used', 'tool': tool_name, 'status': status})}\n\n"
                
                elif event["type"] == "error":
                     yield f"data: {json.dumps({'type': 'error', 'error': event['error']})}\n\n"

            # Stream Finished
            # Send final summary/result event
            final_payload = {
                "type": "result",
                "answer": final_answer_accumulated,
                "tool_calls": tool_calls_accumulated,
                 # Contexts logic for RAG would go here if we extracted it from events
                "highlighted_contexts": [] 
            }
            yield f"data: {json.dumps(final_payload)}\n\n"
            
        except Exception as e:
            logging.error(f"Streaming error: {e}")
            yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"

    # Queue-based Async-to-Sync Bridge for Flask Streaming using Shared Loop
    def generate_sync():
        q = queue.Queue()
        
        async def exhaust_gen():
            try:
                async for chunk in generate():
                    q.put(chunk)
            except Exception as e:
                import traceback
                traceback.print_exc()
                q.put(f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n")
            finally:
                q.put(None)
                
        # Schedule the generator on the permanent shared loop
        asyncio.run_coroutine_threadsafe(exhaust_gen(), _shared_loop)
        
        while True:
            chunk = q.get()
            if chunk is None:
                break
            yield chunk

    return Response(generate_sync(), mimetype='text/event-stream')



@app.route("/upload-doc", methods=["POST"])
def index_document():
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400

    file = request.files['file']
    allowed_extensions = ['.pdf', '.docx', '.html']
    file_extension = os.path.splitext(file.filename)[1].lower()  # type: ignore

    if file_extension not in allowed_extensions:
        return jsonify({"error": f"Unsupported file type. Allowed types are: {', '.join(allowed_extensions)}"}), 400

    # Check if the document already exists by filename
    existing_document = get_document_by_filename(file.filename)
    if existing_document:
        return jsonify({"message": f"File '{file.filename}' is already uploaded.", "file_id": existing_document['id']}), 200

    # Save to uploads folder
    uploads_dir = os.path.join(os.path.dirname(__file__), "uploads")
    if not os.path.exists(uploads_dir):
        os.makedirs(uploads_dir)
        
    file_path = os.path.join(uploads_dir, file.filename)

    try:
        # Save the uploaded file permanently
        file.save(file_path)

        # Insert the new document record into the database
        file_id = insert_document_record(file.filename)

        # Index the document into Pinecone
        success = index_document_to_chroma(file_path, file_id)

        if success:
            return jsonify({"message": f"File {file.filename} has been successfully uploaded and indexed.", "file_id": file_id})
        else:
            # Rollback in case indexing fails
            delete_document_record(file_id)
            if os.path.exists(file_path):
                os.remove(file_path)
            return jsonify({"error": f"Failed to index {file.filename}."}), 500

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/delete-doc', methods=['DELETE'])
def delete_document():
    try:
        data = request.get_json()
        file_id = data.get('file_id')

        if not file_id:
            return jsonify({"error": "file_id is required"}), 400

        # Get filename before deleting record
        documents = get_all_documents()
        filename = next((doc['filename'] for doc in documents if doc['id'] == file_id), None)

        response = DeleteFileRequest(**data)
        
        # Attempt to delete from Pinecone (non-blocking)
        db_message = delete_doc_from_chroma(response.file_id)
        
        # Proceed to delete locally regardless of Pinecone result
        # This triggers "Force Delete" behavior so users aren't stuck
        delete_document_record(file_id)
        
        # Delete physical file
        if filename:
            file_path = os.path.join(os.path.dirname(__file__), "uploads", filename)
            if os.path.exists(file_path):
                os.remove(file_path)
        
        if "Error" in db_message:
            logging.warning(f"ChromaDB deletion error for {file_id}: {db_message}")
            return jsonify({"message": f"Deleted locally, but knowledge base error: {db_message}"}), 200
        else:
            return jsonify({"message": db_message}), 200
    except Exception as e:
        logging.error(f"Error deleting document: {str(e)}", exc_info=True)
        return jsonify({"error": "An error occurred while deleting the document"}), 500


@app.route("/list-docs", methods=["GET"])
def list_documents():
    documents = get_all_documents()
    return jsonify(documents)


@app.route("/show-docs", methods=["GET"])
def show_metaData():
    documents = show_metadata()
    return jsonify(documents)


@app.route("/files/<path:filename>", methods=["GET"])
def serve_file(filename):
    """Serve uploaded files"""
    from flask import send_from_directory
    uploads_dir = os.path.join(os.path.dirname(__file__), "uploads")
    return send_from_directory(uploads_dir, filename)


@app.route("/mcp/servers", methods=["GET"])
def get_mcp_servers():
    servers = mcp_client.get_servers()
    return jsonify(servers)

@app.route("/mcp/tools", methods=["GET"])
def get_mcp_tools():
    tools = run_async(mcp_client.list_tools())
    return jsonify(tools)

@app.route("/mcp/connect", methods=["POST", "OPTIONS"])
def connect_mcp_server():
    if request.method == 'OPTIONS':
        return '', 200
    data = request.json
    print(f"DEBUG: Received data: {data}")
    name = data.get("name")
    command = data.get("command")
    args = data.get("args", [])
    env = data.get("env", {})
    
    print(f"DEBUG: name={name}, command={command}, args={args} (type={type(args)}), env={env}")
    
    if not name or not command:
        return jsonify({"error": "Name and command are required"}), 400

    success, message = run_async(mcp_client.connect_to_server(name, command, args, env))
    if success:
        return jsonify({"message": message}), 200
    else:
        # Check for Auth Required
        if "AUTH_REQUIRED" in message:
            auth_url = message.split(": ", 1)[1]
            return jsonify({
                "error": "Authentication required",
                "auth_url": auth_url,
                "message": "Please authorize in the browser window that opens."
            }), 401
            
        return jsonify({"error": message}), 500



@app.route("/mcp/disconnect", methods=["POST"])
def disconnect_mcp_server():
    data = request.json
    name = data.get("name")
    
    if not name:
        return jsonify({"error": "Name is required"}), 400
        
    mcp_client.remove_server(name)
    return jsonify({"message": f"Server {name} disconnected"}), 200


@app.route("/tool/approve", methods=["POST", "OPTIONS"])
def approve_tool():
    """Approve a pending tool execution and execute it directly"""
    if request.method == 'OPTIONS':
        return '', 200
    
    data = request.json
    approval_id = data.get("approval_id")
    
    if not approval_id:
        return jsonify({"error": "approval_id is required"}), 400
    
    # Get the approval request details
    approval_request = approval_manager.pending_approvals.get(approval_id)
    if not approval_request:
        return jsonify({"error": "Approval request not found or expired"}), 404
    
    # Check if the approval request has expired
    if approval_request.is_expired():
        if approval_id in approval_manager.pending_approvals:
            del approval_manager.pending_approvals[approval_id]
        return jsonify({"error": "Approval request has expired"}), 410
    
    # Check if tool_func is available
    if not approval_request.tool_func:
        return jsonify({"error": "Tool function not available for execution"}), 500
    
    # Set approval decision
    approval_request.decision = "approved"
    
    try:
        # Execute the tool directly with the stored arguments
        print(f"[APPROVAL] Executing tool: {approval_request.tool_name} on {approval_request.server_name}")
        kwargs = dict(approval_request.arguments)
        kwargs['_bypass_approval'] = True
        result = run_async(approval_request.tool_func(**kwargs))
        
        # Enhanced error detection for result (same as agent execution path)
        status = "approved"  # Changed from "success" to match ToolApprovalCard expectations
        
        # Parse stringified MCP JSON
        if isinstance(result, str) and result.strip().startswith("{"):
            try:
                parsed_json = json.loads(result)
                if parsed_json.get("isError") is True:
                    status = "error"
                content_arr = parsed_json.get("content")
                if isinstance(content_arr, list):
                    texts = [item.get("text", "") for item in content_arr if isinstance(item, dict) and item.get("type") == "text"]
                    if texts:
                        result = "\n".join(texts)
            except json.JSONDecodeError:
                pass

        # Check string outputs (fallback)
        if isinstance(result, str) and (result.startswith("Error calling tool") or "Error:" in result):
             status = "error"
        
        # Check dict outputs for error indicators
        if isinstance(result, dict):
            # Check isError flag (handle both boolean and string values)
            is_error_flag = result.get("isError")
            if is_error_flag is True or (isinstance(is_error_flag, str) and is_error_flag.lower() == "true") or is_error_flag == 1:
                status = "error"
                print(f"[ERROR DETECTION] Tool {approval_request.tool_name} marked as error due to isError={is_error_flag}")
            elif result.get("error") and "Error" in str(result.get("error")):
                status = "error"
            elif result.get("message") and "Error" in str(result.get("message")):
                status = "error"

        # Capture tool call for history
        tool_call_record = {
            "tool": approval_request.tool_name,
            "server": approval_request.server_name,
            "arguments": approval_request.arguments,
            "result": result,
            "status": status
        }
        _append_tool_call(tool_call_record)
        
        # Summarize the result using LLM
        try:
            llm = get_llm()
            prompt = ChatPromptTemplate.from_template(
                "You are an AI Banking Assistant.\n\n"
                "Summarize the completed tool action.\n\n"
                "Tool: {tool_name}\n"
                "Args: {arguments}\n"
                "Result: {result}\n\n"
                "Output in **professional markdown**. Use code blocks for code, bold for emphasis. and all other codes also \n"
                "Confirm what happened, show key results. Friendly, short, clear. Max 1 emoji."
            )
            chain = prompt | llm
            summary_response = chain.invoke({
                "tool_name": approval_request.tool_name,
                "arguments": str(approval_request.arguments),
                "result": str(result)
            })
            final_answer = summary_response.content
        except Exception as e:
            print(f"Error summarizing result: {e}")
            final_answer = f"Tool executed successfully. Result: {str(result)}"
        
        # Clean up the approval request
        if approval_id in approval_manager.pending_approvals:
            del approval_manager.pending_approvals[approval_id]
        
        # Return result + summary
        return jsonify({
            "answer": final_answer,
            "result": result, # Raw result for frontend debug/display if needed
            "status": "success",
            "tool_calls": [tool_call_record]
        }), 200
        
    except Exception as e:
        # Capture failed tool call
        tool_call_record = {
            "tool": approval_request.tool_name,
            "server": approval_request.server_name,
            "arguments": approval_request.arguments,
            "error": str(e),
            "status": "error"
        }
        _append_tool_call(tool_call_record)
        
        # Clean up the approval request
        if approval_id in approval_manager.pending_approvals:
            del approval_manager.pending_approvals[approval_id]
        
        return jsonify({
            "error": f"Tool execution failed: {str(e)}",
            "approval_id": approval_id,
            "status": "error",
            "tool_call": tool_call_record
        }), 500


@app.route("/tool/deny", methods=["POST"])
async def deny_tool():
    """Deny a pending tool execution"""
    global _last_denial
    
    data = request.json
    approval_id = data.get("approval_id")
    
    if not approval_id:
        return jsonify({"error": "approval_id is required"}), 400
    
    # Get approval request to capture details
    approval_request = approval_manager.pending_approvals.get(approval_id)
    
    success = approval_manager.set_approval_decision(approval_id, "denied")
    
    if success:
        # Capture denied tool call
        if approval_request:
            tool_call_record = {
                "tool": approval_request.tool_name,
                "server": approval_request.server_name,
                "arguments": approval_request.arguments,
                "status": "denied"
            }
            _append_tool_call(tool_call_record)
            
            # Store denial for next turn
            _last_denial = {
                "tool": approval_request.tool_name,
                "timestamp": datetime.now() # Requires import, or just ignore time
            }
            
            # Remove denied approval from pending list to prevent re-approval
            if approval_id in approval_manager.pending_approvals:
                del approval_manager.pending_approvals[approval_id]
        
        return jsonify({
            "message": "Tool denied",
            "approval_id": approval_id,
            "status": "denied"
        }), 200
    else:
        return jsonify({"error": "Approval request not found or expired"}), 404

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8000))
    app.run(debug=True, host='0.0.0.0', port=port)