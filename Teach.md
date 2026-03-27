# AI Banking Assistant: Educator's Guide 🎓📘

This guide is designed for teaching students the fundamentals of modern Agentic AI architecture using this project as a reference. It includes a live demo script with **real conversation examples** so you know exactly what to say and what to expect.

---

## 🗣️ Live Demo Script (What to Say & What Happens)

Run through these questions in order to demonstrate the full system end-to-end.

### Step 1 — Greet the Assistant (No tools needed)
**You say:** `"Hi, what can you do?"`

**What the AI should answer:**
> Hi! 👋 I'm your **AI Banking Assistant**. I can help you with:
> - **Check your account balance** — just give me your username and password
> - **View recent transactions** — see your last few payments and deposits
> - **Transfer funds** — send money between accounts
> - **Create a bank account** — register a new account in seconds
>
> What would you like to do?

**Teaching Point:** The agent correctly scopes itself to banking. It does NOT say "I can write essays" or anything off-topic.

---

### Step 2 — Ask for Balance (Tools NOT yet connected)
**You say:** `"What's my balance?"`

**What the AI should answer (without tools active):**
> To check your balance I need access to the **Banking MCP tools**, which aren't connected yet.
> Please make sure the `banking-mcp` server is connected in the MCP panel, then ask me again! 🏦

**Teaching Point:** With no tools loaded, the AI does NOT hallucinate a fake balance. It tells the user exactly what's missing. This is the fix for the "go check with your bank" bug.

---

### Step 3 — Ask for Balance (with wrong username, tools ACTIVE)
**You say:** `"What's my balance for user john123?"`

**AI asks:** `"Please provide your password for john123."`

**You say:** `"password123"`

**What the AI should answer:**
> ❌ Sorry, I couldn't find any account with the username **john123**. The username may be incorrect or the account doesn't exist yet.
>
> Would you like to:
> - Try a different username?
> - **Create a new account** for john123?

**Teaching Point:** The MCP tool returns a real DB lookup error. The AI surfaces it clearly instead of guessing.

---

### Step 4 — Create a New Account
**You say:** `"Create an account for me. Username: john123, password: pass456, initial deposit: $500"`

**AI shows an approval card:**
> 🔐 **Approval Required**
> **Tool:** `create_user_account`
> **Username:** john123 | **Deposit:** $500.00
> ➡️ [Approve] [Deny]

**After you click Approve:**
> ✅ Account created successfully!
> - **Username:** john123
> - **Account Number:** 4892-7731
> - **Initial Deposit:** $500.00

**Teaching Point:** Human-in-the-loop confirmation via the approval handler (`api/approval_handler.py`). Destructive or financial operations require explicit user sign-off.

---

### Step 5 — Ask for Balance Again (account now exists)
**You say:** `"Now show me my balance for john123"`

**AI asks:** `"Please provide your password for john123."`

**You say:** `"pass456"`

**What the AI answers:**
> Here's your account summary for **john123** 🏦:
>
> | Account | Balance |
> |---------|---------|
> | 4892-7731 | $500.00 |

**Teaching Point:** Full round-trip — create → authenticate → query. All going through the real PostgreSQL database via the MCP server.

---

## 1. Core Architecture Concepts

### 🤖 Concept 1: Agent vs Simple Bot
**The problem**: Traditional bots are stateless. If a user says "Transfer 500", then "to account 1248", a simple bot forgets the "500".

**The solution**: **LangGraph** with a `checkpointer` manages a persistent state across messages.
- Look at `api/agent_engine.py` — the `create_react_agent` call.
- **Teaching Point**: The `recursion_limit=50` allows the agent to think, fail, and retry tool calls in loops.

### 🧩 Concept 2: LangChain vs. LangGraph
| | LangChain | LangGraph |
|---|---|---|
| **Role** | The Toolkit | The Project Manager |
| **Provides** | LLMs, Prompts, Tools | State machines, loops, memory |
| **Analogy** | Hammer + screwdriver | The engineer using the tools |

LangGraph is built **on top of** LangChain to handle complex, looping workflows.

---

## 2. Model Context Protocol (MCP)

### 🛠️ Concept 3: Decoupled Tool Logic
**Why MCP?** Standard function-calling hardcodes JSON schemas into prompts.

With **MCP**, the tool definition lives in a separate server (`banking_mcp/server.py`):
- The AI *discovers* what it can do by querying the MCP server.
- New tools can be added without changing the agent code.
- **File Reference**: `banking_mcp/server.py` — the `@mcp.tool()` decorator auto-registers each function.

---

## 3. RAG vs. Tools: When to Search vs. When to Act

### 📚 Concept 4: The Router Pattern
| User asks... | Agent does... | File triggered |
|---|---|---|
| "What is your interest rate?" | RAG → searches ChromaDB policy docs | `api/chroma_util.py` |
| "What is **my** balance?" | MCP Tool → queries PostgreSQL | `banking_mcp/server.py` |

The AI automatically picks the right path based on intent — no hardcoded routing.

---

## 4. Security: Password Handling
**The challenge**: LLMs are trained to refuse handling passwords.

**The technique** (look at `api/agent_engine.py`, the `agent_system_prompt`):
- A **Safety Override Directive** for simulated/educational environments.
- Explicitly states this is a secure, controlled deployment.
- Tells the LLM: NEVER refuse to accept credentials, ALWAYS pass them directly to tools.

---

## 5. Implementation Roadmap (How It Was Built)
1. **Infrastructure**: PostgreSQL (data) + ChromaDB (knowledge) in Docker.
2. **MCP Engine**: Banking logic as isolated MCP tools (`banking_mcp/server.py`).
3. **The Brain**: LangGraph ReAct agent in `api/agent_engine.py`.
4. **The Loop**: Multi-step state → approval handler → human-in-the-loop.
5. **The UI**: React streaming frontend with real-time tool execution cards.

---