# AI Banking Assistant: Technical Flow Showcase 🏗️🤖

Maps every user interaction to its exact code path. A complete "Under the Hood" reference.

---

## 📽️ Scenario 1: "What can you do?" — Simple Chat Mode

**User Input:** *"Hi, what can you do?"*

### 🛤️ Execution Path

1. **Entry**: `api/main.py` → `/chat` POST route.
2. **Tool Selection**: `mcp_client.select_relevant_tools()` returns `[]` (no tools connected or relevant).
3. **Mode Decision** (`api/agent_engine.py → stream_rag_chain()`):
   ```python
   if not documents and not tools:   # ← Simple Chat branch
       prompt = ChatPromptTemplate.from_messages([...])
       runnable = prompt | llm
   ```
4. **System Prompt**: Banking-scoped prompt with `CRITICAL — NO LIVE BANKING TOOLS ACTIVE` section.
5. **Streaming**: `runnable.astream_events({"input": query, "chat_history": ...})` → yields `on_chat_model_stream` events → SSE tokens to frontend.

**Core Code**: `agent_engine.py` → `stream_rag_chain()`, lines ~219–258

---

## 📽️ Scenario 2: "What's my balance?" — Tools NOT Connected

**User Input:** *"What's my balance?"*

### 🛤️ Execution Path

1. **Entry**: `api/main.py` → `/chat`.
2. **Tool Selection**: Returns `[]`.
3. **Mode**: Simple Chat (same branch as Scenario 1).
4. **Prompt Rule**:
   ```
   NEVER make up any numbers, balances, or account data.
   ALWAYS explain that the banking-mcp tools are not active and guide them to connect.
   Example: "To check your balance I need access to the Banking MCP tools..."
   ```
5. **LLM Response**: Instructs user to connect `banking-mcp`. No fabricated data.

**Key Behavior**: No hallucination enforced by structure, not just hope.

**Core Code**: `agent_engine.py` → Simple Chat system prompt, lines ~228–237

---

## 📽️ Scenario 3: "Show my balance" → Wrong Credentials (Agent Mode + MCP + DB)

**User Input:** *"Show me my balance for user john123"*  
**AI asks:** *"Please provide your password."*  
**User replies:** *"wrongpass"*

### 🛤️ Execution Path

1. **Entry**: `api/main.py` → `/chat`.
2. **Intelligent Tool Selector** (`mcp_client.select_relevant_tools()`):
   - LLM reads tool descriptions, selects `get_user_accounts`.
3. **Mode Decision**: `tools` list is non-empty → **Agent Mode**:
   ```python
   elif tools:
       is_agent = True
       runnable = create_react_agent(llm, tools=valid_tools, prompt=agent_system_prompt)
   ```
4. **Message History Build**:
   ```python
   messages = []
   for msg in chat_history:
       messages.append(HumanMessage(...) or AIMessage(...))
   messages.append(HumanMessage(content=query))
   ```
5. **LangGraph ReAct Loop** (`astream_events` with `version="v2"`, `recursion_limit=50`):
   - Agent reasons → generates tool call → `on_tool_start` event yielded to UI.
6. **Approval Check** (`mcp_client._create_tool_wrapper()`):
   - `get_user_accounts` does NOT contain destructive keywords → `requires_approval = False`.
   - `tool_func_raw()` called directly.
7. **MCP Call**: `mcp_client.call_tool("banking-mcp", "get_user_accounts", {"username": "john123", "password": "wrongpass"})`.
8. **Session Lookup**: `ensure_session("banking-mcp")` → returns existing `ClientSession` (already alive).
9. **DB Lookup** (`banking_mcp/server.py`):
   - Query: `SELECT * FROM users WHERE LOWER(username) = 'john123'`
   - SHA-256 hash check → **fails**.
   - Returns: `{"isError": true, "content": [{"text": "Invalid credentials or user not found."}]}`
10. **Tool End Event**: `on_tool_end` yielded → UI shows tool result card.
11. **Agent Final Response**: Agent reads `isError=true`, generates error message, streamed as tokens.

**Core Files**:
- `api/agent_engine.py` → Agent Mode, lines ~260–353
- `api/mcp_client.py` → `ensure_session()`, `call_tool()`, `_create_tool_wrapper()`
- `banking_mcp/server.py` → `get_user_accounts` tool

---

## 📽️ Scenario 4: Create a New Account (Approval Gate)

**User Input:** *"Create an account for username: john123, password: pass456, initial deposit $500"*

### 🛤️ Execution Path

1. **Entry**: `api/main.py` → `/chat`.
2. **Tool Selected**: `create_user_account` by `select_relevant_tools()`.
3. **Agent Mode**: LangGraph extracts slots — `username`, `password`, `initial_deposit`.
4. **Approval Gate** (`mcp_client._create_tool_wrapper()`):
   ```python
   destructive_keywords = ['create', 'delete', 'update', 'send', ...]
   requires_approval = any(keyword in name.lower() for keyword in destructive_keywords)
   # 'create_user_account' → requires_approval = True
   ```
   ```python
   async def tool_func(**kwargs):
       approval = approval_manager.create_approval_request(...)
       raise ApprovalRequiredException(approval.to_dict())
   ```
5. **Exception Caught** (`agent_engine.py → stream_rag_chain()`):
   ```python
   except Exception as e:
       if hasattr(e, "approval_request"):
           yield {"type": "approval_required", "approval_request": e.approval_request}
   ```
6. **Frontend**: React renders `ToolApprovalCard` with [Approve] / [Deny] buttons.
7. **User Approves**: Frontend POSTs to `api/main.py → /tool/approve`.
8. **Direct Execution**: `main.py` calls `tool_func_raw(**stored_kwargs)` directly (bypasses approval gate).
9. **MCP Executes**: `banking_mcp/server.py → create_user_account()`:
   - `INSERT INTO users ...`
   - `INSERT INTO accounts ...` (with initial deposit)
10. **LLM Summary**: `main.py` prompts LLM to format the tool result in Markdown.
11. **Streamed Response**: Final Markdown streamed via SSE to frontend.

**Core Files**:
- `api/mcp_client.py` → `_create_tool_wrapper()`, lines ~553–687
- `api/approval_handler.py` → `approval_manager.create_approval_request()`
- `api/approval_tools.py` → `ApprovalRequiredException`
- `api/main.py` → `/tool/approve` route
- `banking_mcp/server.py` → `create_user_account` tool

---

## 📽️ Scenario 5: Check Balance — Full Happy Path

**User Input:** *"What's my balance for john123?"*  
**AI asks:** *"Please provide your password for john123."*  
**User replies:** *"pass456"*

### 🛤️ Execution Path

1. **Entry**: `api/main.py` → `/chat`.
2. **Tool Selection**: `get_user_accounts` selected.
3. **Agent Mode**: LangGraph builds messages from `chat_history` + new `HumanMessage`.
4. **Slot Filling**: Agent extracts `username=john123`, `password=pass456` from conversation context.
5. **Tool Wrapper**: `requires_approval = False` for `get_user_accounts` → executes immediately.
6. **Schema Adapter**: `schema_adapter.apply_llm_patches()` normalizes args if needed. `schema_adapter.reconstruct_for_server()` converts back to native format.
7. **MCP Session**: `ensure_session("banking-mcp")` fast-paths (session already alive).
8. **DB Query** (`banking_mcp/server.py`):
   - `SELECT * FROM users WHERE LOWER(username) = 'john123'` → found.
   - SHA-256 hash check ✅.
   - `SELECT * FROM accounts WHERE user_id = ...` → returns account rows.
9. **Tool Result**: `{"content": [{"text": "Account 4892-7731 | Balance: $500.00"}]}`
10. **Streaming**: LangGraph agent receives result, generates response tokens → `on_chat_model_stream` events → SSE.

**Final Response:**
> Here's your account summary for **john123** 🏦:
> | Account | Balance |
> |---------|---------|
> | 4892-7731 | $500.00 |

**Core Files**:
- `api/agent_engine.py` → Agent Mode streaming loop, lines ~392–427
- `api/mcp_client.py` → `_create_tool_wrapper()`, `call_tool()`, `ensure_session()`
- `banking_mcp/server.py` → SQL logic + hash verification
- `banking_mcp/models.py` → SQLAlchemy: `User`, `Account`, `Transaction`

---

## 🏗️ The System Layer Cake

| Layer | Responsibility | Key Files |
| :--- | :--- | :--- |
| **UI** | Premium Interface & SSE Streaming | `UI/src/App.jsx` |
| **Gateway** | API Routing, SSE, Approval Endpoints | `api/main.py` |
| **Brain** | Three-Mode Router + LangGraph ReAct | `api/agent_engine.py` |
| **Approval** | Human-in-the-Loop Gate | `api/approval_tools.py`, `api/approval_handler.py` |
| **Knowledge** | Policy & Documentation RAG | `api/chroma_util.py` |
| **MCP Transport** | Session Mgmt, Caching, Auth Detection, Schema Adapter, Tool Wrapping | `api/mcp_client.py` |
| **Schema Normalization** | LLM-friendly patches + server-native reconstruction | `api/schema_adapter.py` |
| **Banking Tools** | Secure DB Operations (MCP over stdio) | `banking_mcp/server.py` |
| **Storage** | Structured Transaction Data | `banking_mcp/database.py`, `banking_mcp/models.py` |

---

## 🔁 Full Request Lifecycle (Sequence)

```
User types message
       ↓
api/main.py /chat
       ↓
mcp_client.select_relevant_tools()  ← LLM picks only necessary tools
       ↓
agent_engine.stream_rag_chain()
       ↓
Mode Router:
  ├─ No tools, no docs  → Simple Chat (ChatPromptTemplate | LLM)
  ├─ Tools present      → Agent Mode (create_react_agent / LangGraph ReAct)
  └─ Docs only          → RAG Mode (history-aware retriever + Cohere rerank)
       ↓
[Agent Mode: ReAct Loop]
  Think → Pick Tool → Call Tool → Observe → Repeat (up to recursion_limit=50)
       ↓
[Approval Gate if destructive]
  → raises ApprovalRequiredException
  → frontend shows Approve/Deny card
  → /tool/approve → direct execution
       ↓
mcp_client.call_tool()
  → ensure_session() (persistent asyncio Task)
  → schema_adapter.reconstruct_for_server()
  → ClientSession.call_tool() over stdio
       ↓
Banking MCP Server → PostgreSQL
       ↓
Tool result → Agent generates response tokens
       ↓
on_chat_model_stream events → SSE → React UI
```

---
