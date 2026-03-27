# AI Banking Assistant: Technical Flow Showcase 🏗️🤖

This document maps specific user interactions to the exact code paths and files they trigger. A complete "Under-the-Hood" reference for understanding how each scenario executes.

---

## 📽️ Scenario 1: "What can you do?" (No-Tool Chat Mode)

**User Input:** *"Hi, what can you do?"*

### 🛤️ Execution Path:
1. **Entry Point**: `api/main.py` → `/chat` POST route.
2. **Tool Selection**: `banking-mcp` is appended by default, but if no MCP server is connected, `selected_tools = []`.
3. **Mode Selection** (`api/agent_engine.py`): No docs + No tools → **Simple Chat Mode**.
4. **Prompt**: The `stream_rag_chain` function builds a `ChatPromptTemplate` with the banking-scoped system prompt.
5. **LLM Response**: Streams tokens directly — describes balance, transfers, account creation as capabilities.

**Key Behavior**: The agent does NOT hallucinate. It only describes capabilities it actually has.

**Core File**: `api/agent_engine.py` → `stream_rag_chain()`, lines ~218–245

---

## 📽️ Scenario 2: "What's my balance?" (Tools NOT Connected)

**User Input:** *"What's my balance?"*

### 🛤️ Execution Path:
1. **Entry Point**: `api/main.py` → `/chat`.
2. **Tool Selection**: `selected_tools = []` (banking-mcp not connected).
3. **Mode**: Simple Chat Mode (no tools, no docs).
4. **Prompt Rule Fires**: The system prompt contains the `CRITICAL — NO LIVE BANKING TOOLS ACTIVE` section.
5. **LLM Response**: Explains the tools are not connected and instructs the user to connect `banking-mcp`.

**Key Behavior**: No fabricated balances. No "go to your bank" deflection. Clear, actionable guidance.

**Core File**: `api/agent_engine.py` → `agent_system_prompt` Simple Chat Mode section

---

## 📽️ Scenario 3: "Show my balance" → User Not Found (MCP + DB Flow)

**User Input:** *"Show me my balance for user john123"*
**AI asks:** *"Please provide your password."*
**User replies:** *"wrongpass"*

### 🛤️ Execution Path:
1. **Entry Point**: `api/main.py` → `/chat`.
2. **Tool Selection**: `get_user_accounts` is selected by the intelligent tool selector.
3. **Agent Mode** (`api/agent_engine.py`): LangGraph ReAct agent runs.
4. **Slot Filling**: Agent extracts `username=john123`, `password=wrongpass` from chat history.
5. **Approval Card** (if configured): User sees an approval prompt for the tool call.
6. **MCP Tool Call**: Goes through `api/mcp_client.py` → `banking_mcp/server.py`.
7. **DB Lookup** (`banking_mcp/server.py`):
   - Runs `SELECT * FROM users WHERE LOWER(username) = LOWER('john123')`.
   - Password hash check (SHA-256) → fails.
   - Returns: `{"isError": true, "content": [{"text": "Invalid credentials or user not found."}]}`
8. **Error Surfaced**: Agent reads `isError=true` and informs user credentials are wrong.

**Core Files**:
- `api/agent_engine.py` (ReAct agent)
- `api/mcp_client.py` (MCP transport)
- `banking_mcp/server.py` (DB logic + error response)

---

## 📽️ Scenario 4: Create a New Account

**User Input:** *"Create an account for username: john123, password: pass456, initial deposit $500"*

### 🛤️ Execution Path:
1. **Entry Point**: `api/main.py` → `/chat`.
2. **Tool Selected**: `create_user_account` by the LLM tool selector.
3. **Agent**: Extracts all arguments — `username`, `password`, `account_number` (auto-generated if not given), `initial_deposit`.
4. **Approval Gate** (`api/approval_tools.py`):
   - `ApprovalRequiredException` is raised.
   - `api/main.py` catches it and yields `{"type": "approval_required", ...}` to the frontend.
   - The React UI renders a **ToolApprovalCard** with [Approve] / [Deny] buttons.
5. **User Approves**: Frontend POSTs to `/tool/approve` with `approval_id`.
6. **Direct Execution** (`api/main.py` → `approve_tool()`):
   - Calls `create_user_account(username, password, account_number, initial_deposit, _bypass_approval=True)`.
   - MCP server executes `INSERT INTO users ...` + `INSERT INTO accounts ...`.
7. **LLM Summary**: `api/main.py` prompts the LLM to summarize the result in professional Markdown.
8. **Final Response**: Streamed back to frontend.

**Core Files**:
- `api/approval_tools.py` (exception raising)
- `api/approval_handler.py` (pending approvals store)
- `api/main.py` → `/tool/approve` route
- `banking_mcp/server.py` → `create_user_account` tool

---

## 📽️ Scenario 5: Check Balance (Full Happy Path)

**User Input:** *"What's my balance for john123?"*
**AI asks:** *"Please provide your password for john123."*
**User replies:** *"pass456"*

### 🛤️ Execution Path:
1. **Entry Point**: `api/main.py` → `/chat`.
2. **Intelligent Tool Selector**: LLM picks `get_user_accounts` as most relevant to "balance".
3. **LangGraph Agent**: Builds message history → `get_user_accounts(username="john123", password="pass456")`.
4. **MCP Call**: `api/mcp_client.py` dispatches to `banking_mcp/server.py`.
5. **DB Query**:
   - `SELECT * FROM users WHERE LOWER(username) = 'john123'` → found.
   - Password hash verified ✅.
   - `SELECT * FROM accounts WHERE user_id = ...` → returns account rows.
6. **Result**: `{"content": [{"text": "Account 4892-7731 | Balance: $500.00"}]}`
7. **Token Streaming**: LangGraph agent receives tool result, generates response tokens, streamed via SSE.
8. **Final Response**:

> Here's your account summary for **john123** 🏦:
> | Account | Balance |
> |---------|---------|
> | 4892-7731 | $500.00 |

**Core Files**:
- `api/agent_engine.py` (LangGraph ReAct orchestration)
- `api/mcp_client.py` (MCP transport layer)
- `banking_mcp/server.py` (SQL logic, hash verification)
- `banking_mcp/models.py` (SQLAlchemy schema: `User`, `Account`, `Transaction`)

---

## 🏗️ The System Layer Cake

| Layer | Responsibility | Key Files |
| :--- | :--- | :--- |
| **UI** | Premium Interface & Streaming | `UI/src/App.jsx` |
| **Gateway** | API Routing, SSE Streaming | `api/main.py` |
| **Brain** | LangGraph ReAct Agent, Tool Selection | `api/agent_engine.py` |
| **Approval** | Human-in-the-Loop Gate | `api/approval_tools.py`, `api/approval_handler.py` |
| **Knowledge** | Policy & Documentation RAG | `api/chroma_util.py` |
| **MCP Transport** | Tool Discovery & Dispatch | `api/mcp_client.py` |
| **Banking Tools** | Secure DB Operations (MCP) | `banking_mcp/server.py` |
| **Storage** | Structured Transaction Data | `banking_mcp/database.py`, `banking_mcp/models.py` |

---

## 🔁 Full Request Lifecycle (Sequence)

```
User types message
       ↓
api/main.py /chat
       ↓
Intelligent Tool Selector (LLM picks relevant tools)
       ↓
stream_rag_chain() in agent_engine.py
       ↓
LangGraph ReAct Agent (thinks → picks tool → calls tool)
       ↓
[Approval Gate if needed] → frontend shows Approve/Deny
       ↓
MCP Client → Banking MCP Server → PostgreSQL
       ↓
Tool Result returned to Agent
       ↓
Agent generates final response tokens (streamed to UI via SSE)
```

---
