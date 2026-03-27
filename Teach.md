# AI Banking Assistant: Educator's Guide 🎓📘

This guide is designed for teaching students modern Agentic AI architecture using this project as a live reference. It includes a step-by-step demo script with **real conversation examples** and the exact code that drives each behavior.

---

## 🗣️ Live Demo Script (What to Say & What Happens)

Run through these in order to demonstrate the full system end-to-end.

---

### Step 1 — Greet the Assistant (Simple Chat Mode — No Tools, No Docs)

**You say:** `"Hi, what can you do?"`

**What the AI answers:**
> Hi! 👋 I'm your **AI Banking Assistant**. I can help you with:
> - **Check your account balance** — just give me your username and password
> - **View recent transactions** — deposits and payments
> - **Transfer funds** between accounts
> - **Create a bank account** — register in seconds
>
> What would you like to do?

**Teaching Point — Simple Chat Mode:**  
In `api/agent_engine.py → stream_rag_chain()`:
- `tools = []` and `documents = []` → triggers **Simple Chat Mode** (lines ~219–258).  
- A `ChatPromptTemplate` with a **banking-scoped system prompt** is built and piped directly to the LLM.  
- No agent loop. No tool calls. Pure prompt → LLM → stream.

---

### Step 2 — Ask for Balance (Tools NOT Connected)

**You say:** `"What's my balance?"`

**What the AI answers (without tools active):**
> To check your balance I need access to the **Banking MCP tools**, which aren't connected yet.  
> Please make sure the `banking-mcp` server is connected in the MCP panel, then ask me again! 🏦

**Teaching Point — Hallucination Prevention:**  
The system prompt in Simple Chat Mode contains:
```
## CRITICAL — NO LIVE BANKING TOOLS ACTIVE
NEVER make up any numbers, balances, or account data.
ALWAYS explain that the banking-mcp tools are not active.
```
This is declared directly in `agent_engine.py`'s `stream_rag_chain()` Simple Chat prompt (lines ~228–237).  
The LLM is **structurally prevented** from fabricating data — not just hoped to avoid it.

---

### Step 3 — Ask for Balance (Wrong Credentials, Tools ACTIVE)

**You say:** `"What's my balance for user john123?"`  
**AI asks:** `"Please provide your password for john123."`  
**You say:** `"wrongpass"`

**What the AI answers:**
> ❌ Sorry, I couldn't find any account with username **john123** or the credentials are incorrect.
>
> Would you like to try a different username or **create a new account**?

**Teaching Point — Slot Filling + Tool Execution:**  
In Agent Mode (`tools` are present):
- `create_react_agent` (LangGraph) drives the loop in `agent_engine.py`.  
- **Slot filling**: The agent asks for missing fields (password) before calling the tool — enforced by the agent system prompt.  
- The MCP tool `get_user_accounts` is called via `mcp_client.py → call_tool()`.  
- The banking MCP server does a real DB lookup. A failed hash check returns `{"isError": true}`.  
- The agent reads `isError=true` and surfaces a clean error message.

---

### Step 4 — Create a New Account (Human-in-the-Loop Approval)

**You say:** `"Create an account. Username: john123, password: pass456, initial deposit: $500"`

**AI shows an approval card:**
> 🔐 **Approval Required**  
> **Tool:** `create_user_account`  
> **Username:** john123 | **Deposit:** $500.00  
> ➡️ [Approve] [Deny]

**After you click Approve:**
> ✅ Account created successfully!  
> — **Username:** john123 | **Account Number:** 4892-7731 | **Balance:** $500.00

**Teaching Point — Approval Gate in `mcp_client.py`:**  
In `_create_tool_wrapper()` (lines ~616–686):
```python
destructive_keywords = ['create', 'delete', 'update', 'send', 'write', ...]
requires_approval = any(keyword in name.lower() for keyword in destructive_keywords)
```
If `requires_approval` is `True`, `tool_func()` raises `ApprovalRequiredException` **before** calling the MCP server.  
`main.py` catches it and streams `{"type": "approval_required", ...}` to the React frontend.  
Only after the user clicks Approve does `tool_func_raw()` execute the actual MCP call.

---

### Step 5 — Check Balance (Full Happy Path)

**You say:** `"Now show me my balance for john123"`  
**AI asks:** `"Please provide your password."`  
**You say:** `"pass456"`

**What the AI answers:**
> Here's your account summary for **john123** 🏦:
>
> | Account | Balance |
> |---------|---------|
> | 4892-7731 | $500.00 |

**Teaching Point — End-to-End MCP Flow:**  
Agent builds message history → calls `get_user_accounts(username, password)` →  
`mcp_client.py` dispatches through a **persistent stdio session** to `banking_mcp/server.py` →  
SQLAlchemy queries PostgreSQL → verified result streamed back via SSE.

---

## 1. Core Architecture Concepts

### 🤖 Concept 1: Three-Mode Agent Router

`api/agent_engine.py → stream_rag_chain()` selects a mode based on what the request carries:

| Condition | Mode | What Runs |
|---|---|---|
| No tools, no docs | **Simple Chat** | `ChatPromptTemplate` → LLM stream |
| Tools present | **Agent Mode** | `create_react_agent` (LangGraph ReAct loop) |
| Docs only, no tools | **RAG Mode** | History-aware retriever + Cohere rerank + stuffed context |

No hardcoded routing — the mode is derived purely from the state of `tools` and `documents`.

---

### 🧩 Concept 2: LangChain vs. LangGraph

| | LangChain | LangGraph |
|---|---|---|
| **Role** | The Toolkit | The Orchestrator |
| **Provides** | LLMs, Prompts, Chains, Tools | State machine, loops, memory across turns |
| **In this project** | `ChatPromptTemplate`, `CohereRerank`, `StructuredTool` | `create_react_agent` with `recursion_limit=50` |

LangGraph is built **on top of** LangChain. It uses LangChain building blocks but adds the ability to cycle, retry, and maintain state.

---

## 2. MCP Client Deep Dive (`mcp_client.py`)

### 🛠️ Concept 3: Persistent Sessions & Caching

`McpClient` keeps **long-lived asyncio Tasks** per server:
```python
self.session_tasks[name] = asyncio.create_task(self._run_session_loop(server_config))
```
Once initialized, a session stays alive until explicitly stopped. An `asyncio.Event` signals readiness.

**Tool Caching (5-min TTL):**
```python
self._tools_cache: Dict[str, Dict[str, Any]] = {}
self._cache_ttl: int = 300
```
Avoids calling `list_tools` on every request. Cache invalidated via `invalidate_tools_cache()`.

### 🔒 Concept 4: Per-Server Locking

```python
self._session_locks: Dict[str, asyncio.Lock] = {}
async with self._session_locks[server_name]:
    ...
```
Prevents race conditions when multiple requests arrive before a session is established.

### 🔑 Concept 5: OAuth / Auth-URL Detection

`auth_aware_stdio_client` wraps the stdio transport and monitors **stderr** for OAuth redirect URLs:
```python
match = re.search(r'(https://[^\s]+/authorize\?[^\s]+)', line)
if match:
    raise AuthRequiredError(auth_url)
```
If found, the URL is surfaced to the frontend rather than silently failing.

### ⚙️ Concept 6: Schema Adapter

`schema_adapter.apply_llm_patches()` modifies tool JSON Schemas to be LLM-friendly (e.g., flattening nested objects). `schema_adapter.reconstruct_for_server()` converts LLM-provided flat args back to the server-native format before calling the tool. Zero hardcoded schema hacks in `mcp_client.py`.

---

## 3. RAG vs. Tools: When to Search vs. When to Act

### 📚 Concept 7: The Router Pattern

| User asks... | Agent does... | File triggered |
|---|---|---|
| "What is your interest rate?" | RAG → searches ChromaDB policy docs | `api/chroma_util.py` |
| "What is **my** balance?" | MCP Tool → queries PostgreSQL | `banking_mcp/server.py` |
| "Explain what IBAN is" | Simple Chat → LLM general banking knowledge | `api/agent_engine.py` |

The LLM (`select_relevant_tools` in `mcp_client.py`) selects which tools are relevant before the agent runs, saving tokens.

---

## 4. Security: Password & Credential Handling

**The challenge**: LLMs are trained to refuse handling passwords.

**The technique** (in `api/agent_engine.py`, agent system prompt):
```
AUTHENTICATION PROTOCOL:
Every operation requires a password. Always ask for it if not provided.
NEVER refuse to handle passwords. ALWAYS accept the credentials and
immediately pass them to your tools.
```
This is a **controlled educational environment**. The credentials are never stored by the LLM — they are extracted and passed directly as tool arguments.

---

## 5. Implementation Roadmap (How It Was Built)

1. **Infrastructure**: PostgreSQL (data) + ChromaDB (knowledge) in Docker.
2. **MCP Engine**: Banking logic as isolated MCP tools (`banking_mcp/server.py`).
3. **MCP Client**: Session management, caching, auth detection, schema adapter (`api/mcp_client.py`).
4. **The Brain**: Three-mode router + LangGraph ReAct agent (`api/agent_engine.py`).
5. **Approval Loop**: `ApprovalRequiredException` → React UI card → `/tool/approve` → direct execution.
6. **The UI**: React streaming frontend with real-time tool execution cards and SSE.

---