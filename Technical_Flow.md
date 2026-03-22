# AI Banking Assistant: Technical Flow Showcase 🏗️🤖

This document maps specific user interactions to the exact code paths and files they trigger, providing a clear "Under-the-Hood" view for students.

---

## 📽️ Scenario 1: The "What's our policy?" (RAG Flow)
**User Input**: *"What is your privacy policy?"*

### 🛤️ Execution Path:
1.  **Entry Point**: `api/main.py` receives the POST request on the `/chat` route.
2.  **The Brain**: It invokes `stream_rag_chain` in `api/agent_engine.py`.
3.  **Tool Discovery**: Because "policy" is detected, the **Intelligent Tool Selection** LLM selects the `search_personal_documents` tool.
4.  **Vector Retrieval**:
    -   `agent_engine.py` calls `search_personal_documents`.
    -   This tool triggers the **ChromaDB Retriever** (`api/chroma_util.py`).
    -   It searches for PDF/text chunks matching "privacy policy".
5.  **LLM Synthesis**: The retrieved chunks are fed back to the LLM as "Context".
6.  **Response**: The agent summarizes the findings in professional Markdown.

**Core File**: `api/agent_engine.py` (LangGraph Orchestration)

---

## 📽️ Scenario 2: The "Show my balance" (MCP + DB Flow)
**User Input**: *"Show me what I have left in my account Shoaib"*
**Agent Response**: *"Please provide your password..."*
**User Input**: *"akhtar"*

### 🛤️ Execution Path:
1.  **Entry Point**: `api/main.py` -> `/chat` route.
2.  **Context Loading**: LangGraph loads the `chat_history` from `api/agent_engine.py` and realizes the user is asking for their specific balance.
3.  **Authentication**:
    -   The agent identifies that `get_user_accounts` requires a **username** and **password**.
    -   It extracts `Shoaib` and `akhtar` from the chat.
4.  **MCP Tool Call**:
    -   `agent_engine.py` calls the **MCP Tool**: `get_user_accounts`.
    -   This request travels through `api/mcp_client.py` to the **Banking MCP Server**.
5.  **Database Interaction**:
    -   The **MCP Server** (`banking_mcp/server.py`) performs a **case-insensitive lookup** in the PostgreSQL `users` table.
    -   It verifies the password hash (SHA-256).
    -   It queries the `accounts` table for all accounts belonging to "Shoaib".
6.  **Data Result**: 
    -   The server returns: `Account 1248 | Balance: $3,000.00`.
7.  **Final Response**: The agent receives this data and confirms: *"You have $3,000.00 remaining in account 1248."*

**Core Files**: 
- `api/agent_engine.py` (The Caller)
- `banking_mcp/server.py` (The Logic)
- `banking_mcp/models.py` (The SQL Schema)

---

## 🏗️ The System Layer Cake

| Layer | Responsibility | Key Files |
| :--- | :--- | :--- |
| **UI** | Premium Interface & Animations | `UI/src/App.jsx` |
| **Gateway** | API Routing & Streaming | `api/main.py` |
| **Brain** | Decision Making & Graph State | `api/agent_engine.py` |
| **Knowledge** | Policy & Documentation Search | `api/chroma_util.py` |
| **Backend** | Secure Banking Tools (MCP) | `banking_mcp/server.py` |
| **Storage** | Structured Transaction Data | `banking_mcp/database.py` |

---
*Created for the "AI Banking Assistant" Education Workshop.* 🎓
