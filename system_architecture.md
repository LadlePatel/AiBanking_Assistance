# System Architecture & Flow Design

# AI Banking Assistant: Technical Flow Showcase 🏗️🤖

Maps every user interaction to its exact code path. A complete "Under the Hood" reference.

---

## 📽️ Scenario 1: "What can you do?" — Smart Tool Filtering

**User Input:** *"Hi, what can you do?"*

### 🛤️ Execution Path

1. **Entry**: `api/main.py` → `/chat` POST route.
2. **LLM Pre-check (Token Saver)**: We have 6 MCP tools total. The app asks an LLM: *"Which of these tools do you need for: 'what can you do'?"*
3. **Filter Result**: Zero tools matched. `mcp_client.select_relevant_tools()` returns `[]`. 
4. **Agent Boot**: `api/agent_engine.py → stream_rag_chain()`. The agent boots up with the base Prompt and 0 tools.
5. **System Prompt**: The `agent_system_prompt` tells it its identity as a Banking Assistant.
6. **Streaming**: Agent yields token by token to the React frontend.

**Key File/Code:** `api/main.py:L116` — The `len(tools) > 3` tool selection algorithm.

---

## 📽️ Scenario 2: Scope Enforcement (Off-Topic Query)

**User Input:** *"Can you write a python script for me?"*

### 🛤️ Execution Path

1. **Entry**: `api/main.py` → `/chat`.
2. **Tool Selection**: Returns `[]`.
3. **Prompt Rule**:
   ```
   Stay strictly within banking and finance topics. Politely decline any unrelated requests.
   ```
4. **LLM Response**: The model reads this instruction and refuses to write the code.

**Key File/Code:** `agent_engine.py` (System Prompt definition)

---

## 📽️ Scenario 3: "Show my balance" → Missing Password slot fill + Wrong Password execution

**User Input:** *"Show me my balance for user john123"*  

### 🛤️ Execution Path

1. **Entry**: `api/main.py` → `/chat`.
2. **Intelligent Tool Selector**: LLM selects `get_user_accounts`.
3. **LangGraph Agent boots**: `create_react_agent(llm, tools=[get_user_accounts], ...)`
4. **Agent Loop (Turn 1)**: Agent realizes the `password` arg is missing from the tool's expected schema. It asks the user for the password.
5. **User Replies**: *"wrongpass"*
6. **Agent Loop (Turn 2)**: Agent calls the tool via LangChain `StructuredTool`.
7. **Approval Gate Check**: `mcp_client._create_tool_wrapper()` sees no dangerous words in `get_user_accounts`. Executes via JSON-RPC.
8. **DB Lookup** (`banking_mcp/server.py`):
   - Query: `SELECT * FROM users WHERE LOWER(username) = 'john123'`
   - SHA-256 hash check → **fails**.
   - Returns string standard error or `{"isError": true}` JSON to the agent.
9. **Final Response**: Agent understands the error and formats a polite failure message. 

**Key File/Code:** `api/agent_engine.py` (ReAct Loop) and `banking_mcp/server.py` (Hash checker).

---

## 📽️ Scenario 4: Create a New Account (Human-In-The-Loop Approval)

**User Input:** *"Create an account for username: john123, password: pass456, initial deposit $500"*

### 🛤️ Execution Path

1. **Entry**: `api/main.py` → `/chat`.
2. **Tool Selected**: `create_user_account`. 
3. **LangGraph Loop**: Agent decides to call the tool immediately since it has all 3 required slots filled from the user input.
4. **Approval Gate Exception** (`mcp_client._create_tool_wrapper()`):
   ```python
   dangerous_words = ['create', 'delete', 'update', 'send', ...]
   requires_approval = any(keyword in name.lower() for keyword in dangerous_words)
   # 'create_user_account' → requires_approval = True
   ```
   ```python
   async def tool_func(**kwargs):
       approval = approval_manager.create_approval_request(...)
       raise ApprovalRequiredException(approval.to_dict())  # <-- AGENT PAUSES
   ```
5. **Exception Caught**: The `stream_rag_chain` catches the exception and yields `{"type": "approval_required"}` to React.
6. **UI Render**: React displays the ToolApprovalCard. 
7. **User Approves**: React sends POST to `api/main.py → /tool/approve`.
8. **Direct Execution**: The `/tool/approve` route pulls the pending action from memory and calls `tool_func_raw()` directly, bypassing the gatekeeper.
9. **MCP Executes**: `banking_mcp/server.py → create_user_account()` executes two SQL `INSERT` statements.
10. **LLM formatting**: The raw success string is formatted by a quick one-off LLM call (`main.py:L531`) and sent to the UI.

**Key File/Code:** `api/mcp_client.py:L616` (The gatekeeper wrapper closures).

---

## 📽️ Scenario 5: Check Balance — Full Connected Path

**User Input:** *"What's my balance for john123? Password is pass456."*  

### 🛤️ Execution Path

1. **Entry**: `api/main.py` → `/chat`.
2. **Tool Selection**: `get_user_accounts` selected.
3. **Agent Runs**: Extracts `username` and `password` immediately.
4. **Gatekeeper Check**: Safe tool (no dangerous keywords) — runs automatically.
5. **DB Query** (`banking_mcp/server.py`):
   - `SELECT * FROM users WHERE LOWER(username) = 'john123'` → found.
   - Hash check ✅.
   - `SELECT * FROM accounts WHERE user_id = ...` → returns account rows.
6. **Return**: The MCP tool sends the balance array back to `api/main.py`.
7. **Streaming**: The agent incorporates the DB return array into its stream and types the final markdown balance table for the user.

**Key File/Code:** `banking_mcp/server.py` (SQLAlchemy logic).

---

## 🔁 Full Request Lifecycle (Sequence Diagram)

```
User types message
       ↓
api/main.py POST /chat
       ↓
mcp_client.select_relevant_tools()  ← LLM picks only necessary tools to save tokens
       ↓
agent_engine.stream_rag_chain()
       ↓
[Agent Mode: ReAct Loop]
  Think
  ├─ Action needed? Pick Tool
  │   └── Check if slots filled (password). If no → Ask user.
  ├─ Slots filled? Call Tool.
  │   └── [Approval Gate]
  │         ├─ Dangerous? → Raise ApprovalRequiredException → Pause agent → Show UI Card
  │         └─ Safe? → Run MCP JSON-RPC call over Stdio directly against banking_mcp
  └─ Observe Tool Result
       ↓
Agent formats Tool Result into friendly conversational tokens
       ↓
on_chat_model_stream events yield over SSE
       ↓
React UI reads stream and prints text
```

---

## 🏗️ The System Layer Cake

| Layer | Responsibility | Key Files |
| :--- | :--- | :--- |
| **UI** | Premium Interface, Approval Cards & SSE Streaming | `UI/src/App.jsx` |
| **Gateway** | API Routing, SSE bridging, Approval Direct Exec | `api/main.py` |
| **Brain** | ReAct LLM Loop | `api/agent_engine.py` |
| **Approval** | Human-in-the-Loop Gateway | `api/approval_tools.py`, `api/approval_handler.py` |
| **Transport** | MCP Client, Persistent Subprocess sessions, Stdio | `api/mcp_client.py` |
| **Banking** | Secure Isolated PostgreSQL Tooling | `banking_mcp/server.py` |
| **Storage** | Structured Transaction Data | `banking_mcp/models.py` |


---