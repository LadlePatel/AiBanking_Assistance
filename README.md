# AI Banking Assistant 🏦🚀

> A **Next-Gen Autonomous AI Banker** with **Model Context Protocol (MCP)** integration, featuring RAG (Retrieval-Augmented Generation), LangGraph state management, and human-in-the-loop approval for sensitive operations.

AI Banking Assistant is a sophisticated financial agent built with Python, LangGraph, and MCP. It provides an intelligent interface for personal finance — check balances, transfer funds, create accounts, and query banking policies through a secure natural language chat.

---

## 📖 Key Documentation
- **[Teaching Guide (Teach.md)](./Teach.md)**: Live demo script + deep-dive into LangGraph, MCP, and agentic architecture.
- **[Technical Flow (Technical_Flow.md)](./Technical_Flow.md)**: Exact code paths for every scenario — balance check, account creation, transfers, and more.

---

## 💬 What You Can Do (Demo Walkthrough)

Try these questions in order to explore the full system:

| Step | You Say | What Happens |
| :---: | :--- | :--- |
| 1 | *"What can you do?"* | Agent describes its capabilities without tools |
| 2 | *"What's my balance?"* (no tools) | Tells you to connect `banking-mcp` — no hallucination |
| 3 | *"Show balance for john123"* → wrong creds | DB lookup fails, error surfaced cleanly |
| 4 | *"Create account john123, pass456, $500"* | Approval card → you click Approve → account created |
| 5 | *"What's my balance for john123?"* | Returns real DB balance after authentication |

---

## 🛠️ Technology Stack

### Core AI Engine
- **LangGraph**: Orchestrates the agentic workflow — state, loops, and tool-calling logic.
- **LangChain**: Provides components (LLMs, Prompts, Tools) that LangGraph uses.
- **MCP (Model Context Protocol)**: All financial operations are standardized MCP tools.
- **RAG (Retrieval-Augmented Generation)**: Uses **ChromaDB** to answer policy/FAQ questions.

### Backend
- **Framework**: Flask (async-capable via `flask[async]`)
- **Database**: **PostgreSQL** (Docker-based) — Users, Accounts, Transactions
- **Vector DB**: ChromaDB for document embeddings
- **Reranking**: Cohere Rerank for RAG quality

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
LangGraph ReAct Agent (agent_engine.py)
     ↕                        ↕
ChromaDB RAG           MCP Client (mcp_client.py)
(chroma_util.py)             ↕
                    Banking MCP Server (banking_mcp/)
                             ↕
                        PostgreSQL DB
```

1. **Agent Engine** (`api/agent_engine.py`): LangGraph ReAct agent — decides when to use RAG vs. MCP tools.
2. **Banking MCP Server** (`banking_mcp/server.py`): Isolated tool server with PostgreSQL access.
3. **Approval Handler** (`api/approval_handler.py`): Human-in-the-loop gate for financial operations.
4. **Knowledge Base**: Documents chunked and stored in ChromaDB for FAQ/policy queries.

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
# Stop, keep data
docker-compose stop

# Stop and remove containers (data persists in volumes)
docker-compose down

# Full reset — removes volumes too (CAUTION: deletes all DB data)
docker-compose down -v
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
| **Balance Hallucination** | Ensure `banking-mcp` is connected in the MCP panel (right sidebar) |

---