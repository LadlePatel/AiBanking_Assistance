# AI Banking Assistant: Educator's Guide 🎓📘

This guide is designed for teaching students the fundamentals of modern Agentic AI architecture using this project as a reference.

---

## 1. Technical Deep-Dive: The "Agent" vs "Simple Bot"

### 🤖 Scenario 1: State Management with LangGraph
**The problem**: Traditional bots are stateless. If a user says "Transfer 500", and the bot asks "To which account?", then the user says "1248", the bot might forget the "500".

**The solution**: **LangGraph**.
- Look at `api/agent_engine.py`. We use **LangGraph** with a `checkpointer` to manage memory.
- **Teaching Point**: Students should see how the `recursion_limit` (increased to 50) allows the agent to think, fail, and retry tool calls automatically.

### 🧩 LangChain vs. LangGraph: What's the difference?
- **LangChain**: Think of this as the "Toolkit". It gives us the hammer (LLM), the screwdriver (Tools), and the blueprint (Prompts).
- **LangGraph**: Think of this as the "Project Manager". It decides *how* to use those tools in a cycle. It's built *on top* of LangChain to handle complex, looping states that standard LangChain "chains" cannot.

---

## 2. Model Context Protocol (MCP): The Future of Tools

### 🛠️ Scenario 2: Decoupled Logic
**Why MCP?**: Standard OpenAI function calling requires hardcoded JSON schemas in your prompt.
- With **MCP**, the tool definition is hosted on a separate server (`banking_mcp/server.py`).
- The AI *queries* the server for what it can do.
- **File Reference**: Show `banking_mcp/server.py`. Point out how the `@mcp.tool()` decorator automatically registers the function for the AI to discover.

---

## 3. Secure PII Handling: The "Safety Override" Pattern

### 🔑 Scenario 3: Real-World Credential Flow
**The challenge**: Most LLMs (like GPT-4) are trained to refuse passwords.
- **The Technique**: Look at the `agent_system_prompt` in `api/langchain_util.py`.
- We use a **Safety Override Directive**. By explicitly stating "FOR SIMULATED EDUCATIONAL PURPOSES", we bypass the pre-trained refusal layer.
- **Teaching Point**: How to prompt-engineer "Permission" into an agent while maintaining high accuracy for sensitive tool arguments (username/password).

---

## 4. RAG vs Tooling: When to Search vs When to Do

### 📚 Scenario 4: Knowledge Retrieval
**Scenario**: User asks "What is your interest rate?".
1.  **ChromaDB (RAG)**: The agent searches the vector database for PDF/text policy docs.
2.  **MCP (Tool)**: If the user asks "What is *my* balance?", the agent skips RAG and calls the database via MCP.
- **Teaching Point**: The "Router" pattern. The AI chooses the right path based on user intent.

---

## 5. Implementation Roadmap (How we built it)

1.  **Infrastructure**: Setup PostgreSQL (Data) and ChromaDB (Knowledge) in Docker.
2.  **MCP Engine**: Wrote the banking logic in a standalone MCP server.
3.  **The Brain**: Connected LangChain to the MCP client.
4.  **The Loop**: Added LangGraph to handle multi-step flows and confirmations.
5.  **The UI**: Built a streaming React frontend that displays tool executions visually.

---