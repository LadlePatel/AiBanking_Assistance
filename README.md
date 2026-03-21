# PersonalGPT Agent 🚀

> A **ChatGPT-grade** autonomous AI agent with **MCP (Model Context Protocol)** integration, featuring RAG (Retrieval-Augmented Generation), strict safety gates, persistent sessions, and a polished user experience.

PersonalGPT is a robust AI backend built with Python, Flask, LangChain, and Pinecone. It provides an intelligent chat interface that seamlessly blends document-based conversations, general AI chat, and autonomous tool execution with human-in-the-loop approval workflows.

---

### 5. Environments

- **Web App**: Accessible via browser.
- **Desktop App (Linux)**: Native background app with global shortcuts.

---
## 🖥️ Desktop App Installation (Linux)

PersonalGPT comes with a native Linux desktop application built with Tauri.

### 1. Install the .deb package
You can find the latest release in the `dist` folder.
```bash
sudo dpkg -i dist/PersonalGPT_0.1.0_amd64.deb
```

### 2. Run the Backend
Currently, the Python backend must be running separately:
```bash
# In a terminal
source venv/bin/activate
python api/main.py
```

### 3. Launch the App
- Run `personalgpt` from your terminal or launch from your application menu.
- **Global Shortcut**: Press `Ctrl+Space` to toggle the window.
- **Background Mode**: Closing the window hides it to the background.
---

## 🚀 Setup Instructions

### 1. Prerequisites

- **Python 3.8+**
- **Node.js 16+** & npm
- **Pinecone Account** (API Key & Index)
- **OpenAI API Key**
- **Cohere API Key** (for Reranking)

### 2. Installation

Clone the repository:
```bash
git clone https://github.com/sayeedajmal/PersonalGPT.git
cd PersonalGPT
```

#### Backend Setup

```bash
# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

#### Frontend Setup

```bash
cd UI
npm install
```

### 3. Environment Configuration

Create a `.env` file in the root directory based on `.env.example`.

```bash
cp .env.example .env
```
| Variable | Description | Required? | Default |
| :--- | :--- | :--- | :--- |
| **LLM Configuration** | | | |
| `LLM_PROVIDER` | `openai` or `local` | Yes | `openai` |
| `LLM_MODEL` | Model name (e.g., `gpt-4o-mini` or local model) | Yes | `gpt-4o-mini` |
| **OpenAI Config** | (If `LLM_PROVIDER=openai`) | | |
| `OPENAI_API_KEY` | Your OpenAI API Key | Yes | - |
| **Local LLM Config** | (If `LLM_PROVIDER=local`) | | |
| `LOCAL_LLM_BASE_URL` | Base URL (e.g., `http://localhost:1234/v1`) | Yes | - |
| `LOCAL_LLM_API_KEY` | API Key for local server (or `not-needed`) | No | `not-needed` |
| `LOCAL_LLM_TEMPERATURE`| Sampling temperature (0.0 - 1.0) | No | `0.7` |
| **Vector DB** | | | |
| `PINECONE_API_KEY` | Pinecone API Key | Yes | - |
| `PINECONE_INDEX_NAME`| Index Name | Yes | `personal-gpt-index` |
| `EMBEDDING_DIMENSION`| Vector dimension | Yes | `1536` |
| **Services** | | | |
| `COHERE_API_KEY` | For Reranking (optional but recommended) | Yes | - |
| `DATABASE_URL` | PostgreSQL connection string | No | `sqlite:///...` |
| `PORT` | API Server Port | No | `8000` |

### Example `.env` File
```ini
# LLM: OpenAI
LLM_PROVIDER=openai
LLM_MODEL=gpt-4o-mini
OPENAI_API_KEY=sk-proj-...

# Data
PINECONE_API_KEY=pcsk_...
PINECONE_INDEX_NAME=personal-gpt-index
EMBEDDING_DIMENSION=1536
COHERE_API_KEY=production_...

# Server
PORT=8000
```

## 🏃 Usage

### 1. Start the Backend

```bash
# In project root
source venv/bin/activate
python api/main.py
```
*Server runs at `http://localhost:8000`*

### 2. Start the Frontend

```bash
cd UI
npm start
```
*App opens at `http://localhost:3000`*

### 3. Upload Documents

1. Click the **Upload** button in the sidebar
2. Select PDF, DOCX, or HTML files
3. Wait for indexing to complete
4. Select documents for context in the chat

### 4. Connect MCP Tools

1. Open **Settings** (gear icon)
2. Navigate to **MCP Servers** tab
3. Add server configuration:
   - **Name**: Server identifier
   - **Command**: Executable (e.g., `npx`)
   - **Args**: Arguments array (e.g., `["-y", "server-name"]`)
4. Click **Connect**
5. Approve tool permissions when prompted

### 5. Chat with PersonalGPT

- **Simple Chat**: Type a message without selecting documents
- **RAG Chat**: Select documents, then ask questions about them
- **Tool Usage**: Connect MCP servers and request actions (e.g., "search GitHub for...")
- **Approval Flow**: Approve or deny destructive tool calls


---

## 🎯 Usage Examples

### Example 1: Document Q&A
```
User: Upload "research_paper.pdf"
User: [Selects research_paper.pdf]
User: What are the main findings of this paper?
PersonalGPT: [Uses RAG to retrieve relevant sections and answers]
```

### Example 2: Tool Execution
```
User: [Connects to GitHub MCP server]
User: Search for repositories about machine learning
PersonalGPT: [Proposes to use search_repositories tool]
User: [Approves]
PersonalGPT: Found 10 repositories: ... [formatted results]
```

### Example 3: Hybrid Mode
```
User: [Selects company_docs.pdf + connects Slack server]
User: Summarize our Q3 goals and send them to #engineering
PersonalGPT: 
  - [Uses RAG on company_docs.pdf to extract Q3 goals]
  - [Proposes send_message tool]
User: [Approves]
PersonalGPT: ✅ Summary sent to #engineering
```

---

## 🛠️ Technology Stack

### Backend
- **Framework**: Flask + Flask-CORS
- **AI/ML**: LangChain, OpenAI GPT-4o-mini, Cohere Rerank
- **Vector DB**: Pinecone
- **MCP**: Model Context Protocol (mcp library)
- **Async**: asyncio, anyio
- **Document Processing**: PyMuPDF (fitz), python-docx, langdetect

### Frontend
- **Framework**: React 18
- **Routing**: React Router DOM v7
- **Styling**: TailwindCSS
- **Markdown**: react-markdown, react-syntax-highlighter
- **Animations**: Framer Motion
- **Icons**: React Icons
- **PDF Viewer**: react-pdf
- **Virtualization**: react-virtuoso


## 🌿 Branch Guide

This project maintains several active branches for different features and development stages:

-   **`Relevence`** (Default): The main stable branch containing the core web application.
-   **`hybrid_app`**: The "Hybrid" desktop version built with Tauri (includes global shortcuts and background execution).
-   **`localLLM`**: Optimized version for running entirely with local models (Ollama, LM Studio).
-   **`KIMIAI`**: Experimental feature branch for advanced agentic capabilities.
-   **`claude`**: Branch with specific optimizations and prompts for Anthropic's Claude models.
---

## 🤝 Contributing

We welcome contributions! Here's how you can help:

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Commit** your changes (`git commit -m 'Add amazing feature'`)
4. **Push** to the branch (`git push origin feature/amazing-feature`)
5. **Open** a Pull Request

Please ensure your code follows the existing style and includes appropriate tests.

---

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- **OpenAI** for GPT models and embeddings
- **Anthropic** for Model Context Protocol specification
- **Pinecone** for vector database infrastructure
- **Cohere** for reranking capabilities
- **LangChain** for RAG and agent framework
- **Google DeepMind's Antigravity Team** for verification and polish

---

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/sayeedajmal/PersonalGPT/issues)
- **Discussions**: [GitHub Discussions](https://github.com/sayeedajmal/PersonalGPT/discussions)
- **Email**: sayeedajmala06@gmail.com

---

## 📊 Project Status

![Status](https://img.shields.io/badge/status-active-success.svg)
![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

**Current Phase**: Beta  
**Last Updated**: February 2026  
**Next Milestone**: Multi-user support + PostgreSQL migration

---

*Built with ❤️ by the @SayeedAjmal*
