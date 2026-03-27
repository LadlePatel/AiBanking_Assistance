# AI Banking Assistant 🏦🚀

> A **Next-Gen Autonomous AI Banker** with **Model Context Protocol (MCP)** integration, featuring RAG (Retrieval-Augmented Generation), LangGraph ReAct orchestration, intelligent tool selection, and human-in-the-loop approval for sensitive financial operations.

<img src="mcp_banking_flow_diagram_1774628653137.png">

---
## 📖 Key Documentation
- **[Teaching Guide (Teach.md)](./Teach.md)**: Live demo script + deep-dive into LangGraph, MCP, and agentic architecture.
- **[Technical Flow (Technical_Flow.md)](./Technical_Flow.md)**: Exact code paths for every scenario — balance check, account creation, transfers, and more.

---

## 💬 What You Can Do (Demo Walkthrough)

| Step | You Say | What Happens |
| :---: | :--- | :--- |
| 1 | *"What can you do?"* | Simple Chat Mode — agent describes capabilities, uses banking-scoped system prompt |
| 2 | *"What's my balance?"* (no tools) | Explains `banking-mcp` isn't connected — zero hallucination, zero fabrication |
| 3 | *"Show balance for john123"* → wrong creds | MCP → DB lookup fails, clean error surfaced by agent |
| 4 | *"Create account john123, pass456, $500"* | Approval card shown → you click Approve → account created in PostgreSQL |
| 5 | *"What's my balance for john123?"* | Agent slot-fills password, calls `get_user_accounts` → returns real DB balance |

---

## 🛠️ Technology Stack

### Core AI Engine
- **LangGraph** (`langgraph.prebuilt.create_react_agent`): Orchestrates the ReAct loop — think → tool call → observe → repeat.
- **LangChain**: Provides `ChatPromptTemplate`, `MessagesPlaceholder`, `StructuredTool`, and chain primitives used by `agent_engine.py`.
- **MCP (Model Context Protocol)**: All banking operations are MCP tools discovered dynamically at runtime via `mcp_client.py`.
- **RAG (Retrieval-Augmented Generation)**: ChromaDB + Cohere Rerank for answering policy/FAQ questions from uploaded documents.

### Agent Modes (in `agent_engine.py → stream_rag_chain`)
| Condition | Mode |
| :--- | :--- |
| No tools, no docs | **Simple Chat** — banking-scoped prompt, no hallucination directive |
| Tools present | **Agent Mode** — LangGraph ReAct, MCP tools as primary execution layer |
| Docs only | **RAG Mode** — history-aware retriever + Cohere reranking |

### MCP Client (`mcp_client.py`)
- **Persistent sessions** via `asyncio.Task` + `asyncio.Event` for each server.
- **Per-server locking** (`asyncio.Lock`) prevents connection race conditions.
- **Tool caching** (5-minute TTL) avoids redundant `list_tools` calls.
- **OAuth / Auth-URL detection** via `auth_aware_stdio_client` — captures stderr to intercept auth redirects.
- **`schema_adapter`**: Config-driven JSON Schema patching and server-native argument reconstruction (replaces hard-coded schema hacks).
- **Approval gate**: Tools with destructive keywords (`create`, `delete`, `update`, `send`, etc.) raise `ApprovalRequiredException` before execution.

### Backend
- **Framework**: Flask (async, `flask[async]`)
- **Database**: PostgreSQL (Docker) — Users, Accounts, Transactions
- **Vector DB**: ChromaDB — document chunk storage for RAG
- **Reranking**: Cohere Rerank (`rerank-multilingual-v3.0`)

### Frontend
- **Framework**: React 18 + Vite
- **UI/UX**: TailwindCSS, Framer Motion, real-time SSE streaming

---

## 🏗️ Architecture Overview

```
React UI (Vite)
     ↕  SSE / REST
Flask API (main.py)
     ↕
stream_rag_chain() in agent_engine.py
     ↕                              ↕
ChromaDB RAG (chroma_util.py)    MCP Client (mcp_client.py)
                                       ↕
                               Banking MCP Server (banking_mcp/)
                                       ↕
                                  PostgreSQL DB
```

| File | Responsibility |
| :--- | :--- |
| `api/agent_engine.py` | Three-mode router: Simple Chat / Agent (LangGraph ReAct) / RAG. Streams events via `astream_events`. |
| `api/mcp_client.py` | MCP lifecycle management — sessions, caching, auth detection, tool wrapping, approval gate. |
| `api/approval_handler.py` | In-memory pending approval store with timeout. |
| `api/schema_adapter.py` | Config-driven schema patches for LLM compatibility. |
| `banking_mcp/server.py` | Isolated banking tool server exposing MCP tools over stdio. |

---

## 🚀 Quick Start

### Prerequisites
- Docker & Docker Compose
- OpenAI API Key
- Cohere API Key (for Reranking)

### Full Stack — Docker (Recommended)

```bash
# 1. Configure environment
cp .env.example .env
# Edit .env → add OPENAI_API_KEY and COHERE_API_KEY

# 2. Build and start all services
docker-compose up --build -d
```

#### Service URLs
| Service | URL |
| :--- | :--- |
| **Frontend** | http://localhost:3000 |
| **API (Agent)** | http://localhost:8000 |
| **Database (Postgres)** | localhost:5432 |
| **Vector DB (Chroma)** | http://localhost:8001 |

#### Stop / Clean Up
```bash
docker-compose stop               # Stop, keep data
docker-compose down               # Stop + remove containers
docker-compose down -v            # Full reset (deletes DB data)
```

---

### Manual Development Setup

```bash
# Backend
pip install -r requirements.txt
python api/main.py

# Frontend (separate terminal)
cd UI && npm install && npm run dev
```

---

## 🔧 Troubleshooting

| Issue | Solution |
| :--- | :--- |
| **Port Conflict** | Ensure ports `3000`, `8000`, `5432` are free |
| **API Key Error** | Check `OPENAI_API_KEY` and `COHERE_API_KEY` in `.env` |
| **Database Connection** | Use `postgres` as hostname in Docker. Use `localhost` for manual setup. |
| **Rebuild Needed** | `docker-compose down -v && docker-compose up --build` |
| **Balance Hallucination** | Ensure `banking-mcp` is connected — if no tools are loaded, the Simple Chat system prompt explicitly blocks hallucination |
| **MCP Auth Required** | Check terminal logs — `auth_aware_stdio_client` will print the OAuth URL |
| **Tool Cache Stale** | Cache TTL is 5 min. Call `/mcp/invalidate-cache` or restart the backend to force refresh |

---