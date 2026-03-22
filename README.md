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

### 2. Full Stack Launch (Docker - Recommended)
```bash
# 1. Copy and configure environment (Add your API Key)
cp .env.example .env

# 2. Build and start all services
docker-compose up --build
```
The application will be available at:
- **Frontend**: [http://localhost:3000](http://localhost:3000)
- **API**: [http://localhost:5000](http://localhost:5000)

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
