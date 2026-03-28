# How `chat()` Works — Line by Line, Step by Step

**Focus:** `api/main.py` — the `chat()` function (Line 73)
**Scenario:** User types `"Create an account for username: john123, password: pass456, initial deposit $500"`

This document traces ONLY the `chat()` function and shows exactly how each line leads to the next — all the way to the database.

---

## What is `chat()` exactly?

`chat()` is a Flask "route handler" — it's the function that runs every single time someone sends a message in the chat.

When React does:
```js
fetch("http://localhost:8000/chat", { method: "POST", body: ... })
```

Flask calls `chat()`. That's it. That's the entry point for everything.

---

## Line 74-75 — Handle Browser Preflight (Skip This)

```python
# main.py:L74
if request.method == 'OPTIONS':
    return '', 200
```

**What:** Browsers send an `OPTIONS` request first before a real `POST` to check if the server allows cross-origin requests (CORS). We just say "yes, fine" and return empty.

**Connects to:** Nothing. This is a dead-end for preflight requests only.

---

## Line 79 — Clean Up Old Approvals

```python
# main.py:L79
approval_manager.cleanup_expired()
```

**What:** Delete any pending "Approve/Deny" cards that are older than 2 minutes.

**Why:** If a user saw an approval card and didn't click anything for 2 minutes, it should auto-expire. We don't want old approvals piling up in memory forever.

**Connects to:** `approval_handler.py` → `ApprovalManager.cleanup_expired()` method.

Inside that method:
```python
# approval_handler.py
def cleanup_expired(self):
    now = datetime.utcnow()
    expired = [
        aid for aid, req in self.pending_approvals.items()
        if (now - req.created_at).total_seconds() > req.timeout_seconds
    ]
    for aid in expired:
        del self.pending_approvals[aid]  # Remove expired ones from memory
```

---

## Lines 81-84 — Read What the User Sent

```python
# main.py:L81-L84
data             = request.json
user_input       = data.get("message")          # "Create an account for username: john123..."
chat_history     = data.get("history", [])      # [] — first message, no history yet
source_documents = data.get("source_documents", [])  # [] — no documents selected
```

**What:** Parse the JSON body that React sent. Extract the three important things:
1. `user_input` → the actual text the user typed
2. `chat_history` → all previous messages in this conversation
3. `source_documents` → any uploaded PDFs/docs the user selected (empty here)

**Connects to:** These three variables get passed down to EVERY function below. They are the INPUT that flows through the entire system.

---

## Lines 87-103 — Inject Denial Memory (If User Previously Clicked "Deny")

```python
# main.py:L87-L103
global _last_denial
if _last_denial:
    # Add a note to the message so the AI remembers
    user_input += f"\n\n[SYSTEM NOTE: User DENIED tool '{_last_denial['tool']}'. Don't suggest it again.]"
    _last_denial = None  # Clear it — only relevant for the next message
```

**What:** The AI has no memory between requests. If the user clicked "Deny" on the previous approval card, we need to manually tell the AI about it — otherwise it might suggest the same tool again immediately.

**How it works:**
- When user clicks "Deny" → the `/tool/deny` endpoint sets `_last_denial = {"tool": "create_user_account"}`
- Next time user sends ANY message → this code appends the denial note to `user_input`
- The AI reads the note and knows not to retry that tool

**Important:** `_last_denial` is a **module-level global variable**. This means it's shared across all users. In a real multi-user system this would be a bug (User A's denial could affect User B). For demo purposes with one user it works fine.

---

## Lines 107-138 — Get the Tools the AI Can Use

```python
# main.py:L107
selected_server_names = ["banking-mcp"]  # Always use banking MCP, no configuration needed
```

**What:** Hardcoded to always use the banking MCP server. 

```python
# main.py:L113
all_selected_tools = run_async(mcp_client.get_langchain_tools(filter_servers=["banking-mcp"]))
```

**What:** Ask the MCP client: "Give me all tools from banking-mcp as LangChain tool objects."

**`run_async()`** is the bridge between Flask (synchronous) and the async MCP world. It says: "Run this async function and block here until you get the result back."

**What `get_langchain_tools()` returns** (6 LangChain StructuredTool objects):
```
1. create_user_account    ← the one we need
2. get_user_accounts
3. create_transaction
4. get_recent_transactions
5. setup_dummy_bank_data
6. reset_banking_database
```

Each one is a Python function the AI can call by name.

**→ This jumps to:** `mcp_client.py:L689` → `list_tools()` → `ensure_session()` → starts the MCP server subprocess if not running → asks it for the tool list via JSON-RPC → wraps them → returns here.

*(Full MCP connection chain is in `walkthrough.md` Steps 3-8)*

---

## Lines 116-134 — Smart Tool Filtering (AI Picks Only What It Needs)

```python
# main.py:L116
if len(all_selected_tools) > 3:  # We have 6 tools — more than 3 → filter
    print(f"[TOOL SELECTION] Found 6 tools, selecting relevant ones...")
```

**Why:** Giving the AI ALL 6 tools with their full schemas = more tokens = more cost + slower + potentially confusing.

**Step 1: Build a lightweight list of tool names + descriptions**
```python
# main.py:L120-L124
tools_for_selection = [
    {
        "name": "create_user_account",
        "description": "Create a new bank account for an existing or new user...",
        "server": "banking-mcp"
    },
    # ... 5 more like this
]
```
This is just names + descriptions. NOT the full input schemas. Much smaller.

**Step 2: Ask the AI "Which tools are relevant for this user's request?"**
```python
# main.py:L127
relevant_tool_dicts = run_async(
    mcp_client.select_relevant_tools(user_input, tools_for_selection, chat_history=chat_history)
)
```

**→ This jumps to:** `mcp_client.py:L500` — `select_relevant_tools()`

Inside that function, a quick, cheap LLM call happens:
```
Prompt to LLM:
  "User message: 'Create an account for username: john123, password: pass456, initial deposit $500'"
  "Available tools: [create_user_account, get_user_accounts, create_transaction, ...]"
  "Which tools are needed? Return a JSON array of tool names only."

LLM replies: ["create_user_account"]
```

**Step 3: Keep only the relevant tools**
```python
# main.py:L131
relevant_tool_names = ["create_user_account"]   # from LLM response
selected_tools = [t for t in all_selected_tools if t.name in relevant_tool_names]
# → selected_tools = [<StructuredTool: create_user_account>]
# → Only 1 tool left. Down from 6.
print(f"[TOOL SELECTION] Selected 1 relevant tools: ['create_user_account']")
```

---

## Line 141 — Build a Server Lookup Map

```python
# main.py:L141
tool_name_to_server = {
    "create_user_account": "banking-mcp"
}
```

**What:** Simple dictionary so later when a tool call finishes, we know which server it came from (needed for the response payload).

---

## Lines 144-259 — The Streaming Generator (The Main Engine)

```python
# main.py:L144
async def generate():
```

**What:** This is an `async generator` function. Instead of computing everything and returning once, it `yield`s data chunks one by one as they become available. React reads these chunks in real time — that's the "typing effect".

Think of it like a water tap. `generate()` opens the tap. Flask streams the water (data chunks) to React. React displays each drop as it arrives.

### Line 149 — Start the AI Agent

```python
# main.py:L149
async for event in stream_rag_chain(user_input, chat_history, tools=selected_tools, documents=source_documents):
```

**What:** This is the big call. It starts the LangGraph AI agent.

**→ This jumps to:** `agent_engine.py:L194` — `stream_rag_chain()`

Inside `stream_rag_chain()`:
1. Sees `tools = [create_user_account_tool]` → enters **agent mode**
2. Builds the system prompt (banking assistant instructions)
3. Creates a `create_react_agent(llm, tools, prompt)` — the ReAct AI loop
4. Runs `astream_events()` — streams events back here one by one

Each `event` that comes back has a `type`:
- `"token"` → AI is generating text
- `"tool_start"` → AI is about to call a tool
- `"tool_end"` → Tool finished (or errored)
- `"approval_required"` → Tool needs human approval ← **OUR CASE**
- `"error"` → Something went wrong

### Lines 152-165 — Approval Required? Stop Everything and Ask User

```python
# main.py:L152
if event["type"] == "approval_required":
    approval_req = event["approval_request"]
    approval_id  = approval_req["approval_id"]
```

**What happened before this line:**
The AI decided to call `create_user_account` with:
```json
{
  "username": "john123",
  "password": "pass456",
  "account_number": "CHK-1004",
  "initial_deposit": 500
}
```
But the tool wrapper saw "create" in the name → created an `ApprovalRequest` with a UUID → raised `ApprovalRequiredException` → the exception bubbled up through LangGraph → caught in `agent_engine.py` → turned into an `"approval_required"` event → landed here.

```python
# main.py:L156-L162
# Save the full context (what user asked, what AI wants to do)
# so we can use it if the user clicks "Approve" later
if approval_id in approval_manager.pending_approvals:
    approval_manager.pending_approvals[approval_id].request_context = {
        "user_input": user_input,           # "Create an account for..."
        "chat_history": chat_history,        # [] — empty first turn
        "selected_servers": ["banking-mcp"],
        "source_documents": []
    }
```

**Why save the context?** The `/tool/approve` endpoint needs to know the original request if it has to re-run anything.

```python
# main.py:L164-L165
# Send the approval event to React as an SSE chunk
yield f"data: {json.dumps({'type': 'approval_required', 'approval_request': approval_req})}\n\n"
return  # ← STOP. The generator ends here. Stream closes.
```

**What React gets:**
```json
{
  "type": "approval_required",
  "approval_request": {
    "approval_id": "3f4a-8b2c-...",
    "tool_name": "create_user_account",
    "server_name": "banking-mcp",
    "arguments": {
      "username": "john123",
      "password": "pass456",
      "account_number": "CHK-1004",
      "initial_deposit": 500
    },
    "description": "Create a new bank account for..."
  }
}
```

React renders the Approve/Deny card. `chat()` is done for now. The AI is paused.

---

## Lines 168-171 — Normal Text Streaming (If No Approval Needed)

*(This path is for read-only tools like "check my balance")*

```python
# main.py:L168
if event["type"] == "token":
    yield f"data: {json.dumps({'type': 'token', 'content': event['content']})}\n\n"
    final_answer_accumulated += event['content']
```

**What:** Each word/token the AI generates gets streamed to React immediately. This is what creates the letter-by-letter typing effect in the chat UI.

---

## Lines 173-241 — Tool Finished — Record What Happened

```python
# main.py:L173
elif event["type"] == "tool_end":
    tool_data = event["data"]
    output = tool_data.get("output")
```

**What:** After a tool executes (for non-approval tools), this records the result.

**The tricky output parsing (Lines 187-229):**

The result coming back from the MCP server can be in many formats depending on the tool. The code handles each one:

```python
# Case 1: It's a LangChain message object (has .content attribute)
if hasattr(output, 'content'):
    output = output.content    # extract the string

# Case 2: It's a list of content blocks (MCP standard format)
if isinstance(output, list):
    parts = []
    for item in output:
        if item.get("type") == "text":
            parts.append(item.get("text", ""))  # extract text
    output = "\n".join(parts)

# Case 3: It's a JSON string with MCP's native error format
if output.strip().startswith("{"):
    parsed = json.loads(output)
    if parsed.get("isError") is True:
        status = "error"   # mark as failed

# Case 4: Plain string starting with "Error"
if output.strip().startswith("Error") or "Exception" in output:
    status = "error"
```

**Why so many cases?** Different MCP tools return results in slightly different formats. LangChain adds its own wrapper layer too. This code normalizes everything to a plain string.

```python
# main.py:L233-L241
rec = {
    "tool": "create_user_account",
    "server": "banking-mcp",
    "status": "approved",    # or "error"
    "result": output
}
tool_calls_accumulated.append(rec)

# Notify React that a tool was used
yield f"data: {json.dumps({'type': 'tool_used', 'tool': 'create_user_account', 'status': 'approved'})}\n\n"
```

---

## Lines 246-255 — Stream is Done — Send the Final Summary

```python
# main.py:L248
final_payload = {
    "type": "result",
    "answer": final_answer_accumulated,   # all the text the AI typed
    "tool_calls": tool_calls_accumulated, # list of tools used and their results
    "highlighted_contexts": []            # RAG documents used (empty for this scenario)
}
yield f"data: {json.dumps(final_payload)}\n\n"
```

**What:** After all events are processed, send the complete final result to React in one payload. React uses this to:
- Show the full answer in the chat bubble
- Update the "Tools Used" sidebar
- Clear any loading states

---

## Lines 262-285 — The Sync-Async Bridge (Flask's Secret Plumbing)

```python
# main.py:L262
def generate_sync():
    q = queue.Queue()  # a thread-safe queue — like a pipe between threads

    async def exhaust_gen():
        async for chunk in generate():  # run the async generator
            q.put(chunk)               # push each chunk into the queue
        q.put(None)                    # None = signal that we're done

    # Submit exhaust_gen to run on the background shared loop
    asyncio.run_coroutine_threadsafe(exhaust_gen(), _shared_loop)

    # Meanwhile, THIS thread reads from the queue and yields to Flask
    while True:
        chunk = q.get()   # BLOCKS here waiting for a chunk to arrive
        if chunk is None:
            break          # None means done
        yield chunk        # give it to Flask to send to React
```

**Why does this exist?** Flask is synchronous. The `generate()` function is async. You can't just `yield` from an async generator into a sync Flask response.

**So the trick:**
1. Run the async generator on the background event loop
2. Each chunk it produces gets pushed into a `queue.Queue` (thread-safe)
3. The sync side reads from the queue and yields to Flask
4. Flask sends each chunk to React via SSE

**Think of it like:** Two workers passing packages through a window. Worker 1 (async side) makes the packages and pushes them through the window (queue). Worker 2 (sync/Flask side) picks them up from the other side and delivers them to the customer (React).

```python
# main.py:L285
return Response(generate_sync(), mimetype='text/event-stream')
```

**This is the final line of `chat()`.** Flask returns an HTTP response that streams chunks from `generate_sync()` to React with the `text/event-stream` content type (SSE).

---

## Full Internal Call Map of `chat()`

```
chat()  ← called by Flask when POST /chat arrives
│
├── approval_manager.cleanup_expired()
│     └── approval_handler.py: removes approvals older than 2 min
│
├── [Read request data]
│     user_input = "Create an account for username: john123..."
│     chat_history = []
│     source_documents = []
│
├── [Inject denial note if needed]
│     (skipped — no previous denial)
│
├── run_async(mcp_client.get_langchain_tools(["banking-mcp"]))
│     └── mcp_client.py:L689 → get_langchain_tools()
│           └── list_tools() → check cache → miss
│                 └── ensure_session() → server not running
│                       └── _run_session_loop() → anyio.open_process("python3 server.py")
│                             └── banking_mcp/server.py starts up
│                                   └── init_db(), register 6 tools, listen on stdin
│                       └── session.initialize() handshake ✓
│                 └── session.list_tools() → JSON-RPC → 6 tool schemas returned
│           └── _create_tool_wrapper() × 6
│                 └── For "create_user_account":
│                       ├── schema_adapter → no-op for banking-mcp
│                       ├── Pydantic model generated from JSON schema
│                       ├── "create" in name → requires_approval = True
│                       ├── tool_func_raw() closure defined (real executor)
│                       └── tool_func() closure defined (gatekeeper)
│     ← returns: [6 StructuredTool objects]
│
├── if len(tools) > 3:
│     └── run_async(mcp_client.select_relevant_tools(user_input, tools, history))
│           └── mcp_client.py:L500
│                 └── LLM call (temp=0):
│                       "Which tools needed for: 'Create an account...?' → ["create_user_account"]
│     ← selected_tools = [<StructuredTool: create_user_account>]
│
├── tool_name_to_server = {"create_user_account": "banking-mcp"}
│
├── generate()  [async generator - starts streaming]
│     └── stream_rag_chain(user_input, chat_history, tools, documents)
│           └── agent_engine.py:L194
│                 └── create_react_agent(llm, tools=[create_user_account], prompt)
│                 └── astream_events(messages)
│                       AI THINK: "I need to call create_user_account"
│                       AI ACT:   tool_func(username="john123", password="pass456", ...)
│                                   └── requires_approval=True
│                                         └── create ApprovalRequest (UUID)
│                                         └── raise ApprovalRequiredException
│                                               └── caught in agent_engine.py:L458
│                                                     └── yield event "approval_required"
│           ← event: {"type": "approval_required", "approval_request": {...}}
│
│     ← event received in generate() at main.py:L152
│           ├── save request_context in approval_manager
│           ├── yield SSE chunk to React: {"type":"approval_required","approval_request":{...}}
│           └── return  ← generator stops, stream closes
│
└── generate_sync()  [the sync wrapper]
      ├── asyncio.run_coroutine_threadsafe(exhaust_gen(), _shared_loop)
      └── yield each chunk from queue → Flask → React

[React shows Approve/Deny card. chat() is fully done at this point.]

===== USER CLICKS "APPROVE" =====
→ React: POST /tool/approve {approval_id: "3f4a-..."}
→ Goes to approve_tool() in main.py:L451 (separate route — NOT inside chat())
→ See: how_approve_works.md  (or walkthrough.md STEP 12 onwards)
```

---

## Key Decisions Made Inside `chat()`

| Decision | Where | Why |
|---|---|---|
| Always use "banking-mcp" | L107 | Hardcoded after removing the dynamic connect feature |
| Filter tools with a second LLM call | L116-L131 | Fewer tokens = cheaper, faster, less confusing for AI |
| Use SSE streaming instead of a plain response | L285 | User sees typing effect; for agent flows can take 5-30 seconds |
| Use a queue bridge for sync/async | L262-L283 | Flask is sync, LangGraph events are async — queue is the bridge |
| Inject denial note into user message | L89-L93 | LangGraph has no persistent memory between requests |
| Stop the stream on approval | L164-L165 | Can't both stream tokens AND wait for user input at the same time |


## WHAT ACTUALLY HAPPENS IN CHAT FUNCTION

| Line | What it does | Goes where |
|---|---|---|
| **L74-75** | Browser preflight — just say "yes" and return | Dead end |
| **L79** | Delete expired approval cards (2min timeout) | `approval_handler.py` |
| **L81-84** | Parse user message, history, documents | These flow into everything below |
| **L87-103** | Inject denial note if user said "No" before | Appended to `user_input` |
| **L107** | Force `banking-mcp` always on | Hardcoded |
| **L113** | Get tool objects from MCP | `mcp_client.py:L689` → starts the server process |
| **L116-131** | Quick LLM call to pick only the 1 needed tool | `mcp_client.py:L500` → saves tokens |
| **L141** | Map tool name → server name | Used later in the result payload |
| **L149** | Start the AI agent, stream back events | `agent_engine.py:L194` |
| **L152-165** | Approval required? → save context, tell React, STOP | Stream ends here for our scenario |
| **L168-171** | Normal token streaming (for read-only tools) | Typing effect in UI |
| **L173-241** | Tool finished → normalize the output (4 format cases) | Build the result record |
| **L248-255** | Send final summary payload to React | End of conversation turn |
| **L262-285** | The queue bridge — async → sync → Flask → SSE | The plumbing nobody thinks about |