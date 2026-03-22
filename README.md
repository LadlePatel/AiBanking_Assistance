# AI Banking Assistant 🏦🚀

> A **Next-Gen Autonomous AI Banker** with **Model Context Protocol (MCP)** integration, featuring RAG (Retrieval-Augmented Generation), LangGraph state management, and strict multi-factor authentication.

AI Banking Assistant is a sophisticated financial agent built with Python, LangChain, and MCP. It provides an intelligent interface for personal finance, allowing users to check balances, transfer funds, and query banking policies through a secure, natural language chat.

---

## 📖 Key Documentation
- **[Teaching Guide (Teach.md)](./Teach.md)**: A deep-dive into LangGraph, MCP, and the "Brain" of the system.
- **[Technical Flow Showcase (Technical_Flow.md)](./Technical_Flow.md)**: See exactly how code executes for RAG and Banking scenarios.

---

## 🛠️ Technology Stack

### Core AI Engine
- **LangGraph**: The brain of the assistant. It orchestrates the agentic workflow, managing state, loops, and tool-calling logic.
- **LangChain**: The foundation. It provides the components (LLMs, Prompts, Tools) that LangGraph uses to execute tasks.
- **MCP (Model Context Protocol)**: Powering the banking backend. All financial operations are handled as standardized MCP tools.
- **RAG (Retrieval-Augmented Generation)**: Uses **ChromaDB** to store and query banking documentation, NPCs, and FAQs.

### Backend
- **Framework**: FastAPI / Flask for the main agent API.
- **Database**: **PostgreSQL** (Docker-based) for structured banking records (Users, Accounts, Transactions).
- **Communication**: Model Context Protocol (MCP) for decoupled tool execution.

### Frontend
- **Framework**: React 18 + Vite.
- **UI/UX**: Premium design with TailwindCSS, Framer Motion animations, and real-time streaming updates.

---

## 🏗️ Architecture Overview

The system is designed as a modular ecosystem:

1.  **The Agent Engine (`api/agent_engine.py`)**: The brain. Built with **LangGraph**, it uses a stateful ReAct agent to decide when to look up documentation (RAG) vs. when to execute a financial transaction (MCP).
2.  **Banking MCP Server (`banking_mcp/server.py`)**: The engine. A dedicated server that interfaces directly with the PostgreSQL database. It exposes secure tools like `get_user_accounts` and `create_transaction`.
3.  **Authentication Gate**: A strict password-based entry system enforced at the tool level, bypassing standard LLM safety refusals via a custom `SAFETY OVERRIDE` protocol for simulated environments.
4.  **Knowledge Base**: Documents are processed, chunked, and stored in ChromaDB, enabling the assistant to answer "How do I..." questions accurately.

---

## 🚀 Quick Start

### 1. Prerequisites
- Docker & Docker Compose
- OpenAI API Key

### 2. Full Stack Build & Launch (Docker - Recommended)

The easiest way to run the entire ecosystem (Frontend, API, Postgres, ChromaDB) is via Docker Compose.

#### ⚙️ Setup
```bash
# 1. Configure environment (Add your OpenAI API Key)
cp .env.example .env
```

#### 🏗️ How to Build
To build the Docker images for the first time or after any code changes:
```bash
docker-compose build
```

#### 🚀 How to Run
To start all services in the background:
```bash
docker-compose up -d
```
*Tip: You can build and run in one step: `docker-compose up --build -d`*

#### 🛑 How to Stop
To stop all containers and keep your data:
```bash
docker-compose stop
```
To stop and remove containers (data persists in volumes):
```bash
docker-compose down
```
To stop and remove containers **AND** delete all database data (CAUTION!):
```bash
docker-compose down -v
```

#### 🖥️ How to run ONLY the UI?
If you want to run just the Frontend in a container (e.g., if you are running the API locally):
```bash
docker-compose up -d --no-deps ui
```
*Note: This will skip starting the API and databases. Ensure your `REACT_APP_API_URL` in `.env` or `docker-compose.yml` points to your local machine (e.g., `http://host.docker.internal:5000` on Mac/Windows).*

#### 🌐 Access URLs:
- **Frontend**: [http://localhost:3000](http://localhost:3000)
- **API (Agent)**: [http://localhost:5000](http://localhost:5000)
- **Database (Postgres)**: `localhost:5432`
- **Vector DB (Chroma)**: [http://localhost:8001](http://localhost:8001)

---

### 3. Troubleshooting Docker
If you encounter issues during setup:

| Issue | Solution |
| :--- | :--- |
| **Port Conflict** | Ensure ports `3000`, `5000`, and `5432` are not being used by local processes. |
| **API Key Error** | Double-check that `OPENAI_API_KEY` is correctly set in your `.env` file. |
| **Database Connection** | If the MCP server fails, ensure `BANKING_DATABASE_URL` in `.env` uses the `postgres` hostname for Docker. |
| **Rebuild Needed** | Run `docker-compose down -v` and `docker-compose up --build` to clear volumes and rebuild. |

---

### 3. Manual Development Setup (Optional)

If you prefer to run services individually without Docker:

#### Backend
```bash
# Install dependencies
pip install -r requirements.txt

# Launch the Agent API
python api/main.py
```

#### Frontend
```bash
cd UI && npm install && npm start
```
---

## 📞 Support & Contributions
Built with ❤️ @SayeedAjmal.
