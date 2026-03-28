# System Architecture & Flow Design

# AI Banking Assistant: Technical Flow Showcase 🏗️🤖

Maps every user interaction to its exact code path. A complete "Under the Hood" reference.

---

## 📽️ Scenario 1: "What can you do?" — Smart Tool Filtering

**User Input:** *"Hi, what can you do?"*

### 🛤️ Execution Path

1. **Entry**: `api/main.py` → `/chat` POST route.
2. **LLM Pre-check (Token Saver)**: We have 6 MCP tools total. The app asks an LLM: *"Which of these tools do you need for: 'what can you do'?"*
3. **Filter Result**: Zero tools matched. `mcp_client.select_relevant_tools()` returns `[]`. 
4. **Agent Boot**: `api/agent_engine.py → stream_rag_chain()`. The agent boots up with the base Prompt and 0 tools.
5. **System Prompt**: The `agent_system_prompt` tells it its identity as a Banking Assistant.
6. **Streaming**: Agent yields token by token to the React frontend.

**Key File/Code:** `api/main.py:L116` — The `len(tools) > 3` tool selection algorithm.

---

## 📽️ Scenario 2: Scope Enforcement (Off-Topic Query)

**User Input:** *"Can you write a python script for me?"*

### 🛤️ Execution Path

1. **Entry**: `api/main.py` → `/chat`.
2. **Tool Selection**: Returns `[]`.
3. **Prompt Rule**:
   ```
   Stay strictly within banking and finance topics. Politely decline any unrelated requests.
   ```
4. **LLM Response**: The model reads this instruction and refuses to write the code.

**Key File/Code:** `agent_engine.py` (System Prompt definition)

---

## 📽️ Scenario 3: "Show my balance" → Missing Password slot fill + Wrong Password execution

**User Input:** *"Show me my balance for user john123"*  

### 🛤️ Execution Path

1. **Entry**: `api/main.py` → `/chat`.
2. **Intelligent Tool Selector**: LLM selects `get_user_accounts`.
3. **LangGraph Agent boots**: `create_react_agent(llm, tools=[get_user_accounts], ...)`
4. **Agent Loop (Turn 1)**: Agent realizes the `password` arg is missing from the tool's expected schema. It asks the user for the password.
5. **User Replies**: *"wrongpass"*
6. **Agent Loop (Turn 2)**: Agent calls the tool via LangChain `StructuredTool`.
7. **Approval Gate Check**: `mcp_client._create_tool_wrapper()` sees no dangerous words in `get_user_accounts`. Executes via JSON-RPC.
8. **DB Lookup** (`banking_mcp/server.py`):
   - Query: `SELECT * FROM users WHERE LOWER(username) = 'john123'`
   - SHA-256 hash check → **fails**.
   - Returns string standard error or `{"isError": true}` JSON to the agent.
9. **Final Response**: Agent understands the error and formats a polite failure message. 

**Key File/Code:** `api/agent_engine.py` (ReAct Loop) and `banking_mcp/server.py` (Hash checker).

---

## 📽️ Scenario 4: Create a New Account (Human-In-The-Loop Approval)

**User Input:** *"Create an account for username: john123, password: pass456, initial deposit $500"*

### 🛤️ Execution Path

1. **Entry**: `api/main.py` → `/chat`.
2. **Tool Selected**: `create_user_account`. 
3. **LangGraph Loop**: Agent decides to call the tool immediately since it has all 3 required slots filled from the user input.
4. **Approval Gate Exception** (`mcp_client._create_tool_wrapper()`):
   ```python
   dangerous_words = ['create', 'delete', 'update', 'send', ...]
   requires_approval = any(keyword in name.lower() for keyword in dangerous_words)
   # 'create_user_account' → requires_approval = True
   ```
   ```python
   async def tool_func(**kwargs):
       approval = approval_manager.create_approval_request(...)
       raise ApprovalRequiredException(approval.to_dict())  # <-- AGENT PAUSES
   ```
5. **Exception Caught**: The `stream_rag_chain` catches the exception and yields `{"type": "approval_required"}` to React.
6. **UI Render**: React displays the ToolApprovalCard. 
7. **User Approves**: React sends POST to `api/main.py → /tool/approve`.
8. **Direct Execution**: The `/tool/approve` route pulls the pending action from memory and calls `tool_func_raw()` directly, bypassing the gatekeeper.
9. **MCP Executes**: `banking_mcp/server.py → create_user_account()` executes two SQL `INSERT` statements.
10. **LLM formatting**: The raw success string is formatted by a quick one-off LLM call (`main.py:L531`) and sent to the UI.

**Key File/Code:** `api/mcp_client.py:L616` (The gatekeeper wrapper closures).

---

## 📽️ Scenario 5: Check Balance — Full Connected Path

**User Input:** *"What's my balance for john123? Password is pass456."*  

### 🛤️ Execution Path

1. **Entry**: `api/main.py` → `/chat`.
2. **Tool Selection**: `get_user_accounts` selected.
3. **Agent Runs**: Extracts `username` and `password` immediately.
4. **Gatekeeper Check**: Safe tool (no dangerous keywords) — runs automatically.
5. **DB Query** (`banking_mcp/server.py`):
   - `SELECT * FROM users WHERE LOWER(username) = 'john123'` → found.
   - Hash check ✅.
   - `SELECT * FROM accounts WHERE user_id = ...` → returns account rows.
6. **Return**: The MCP tool sends the balance array back to `api/main.py`.
7. **Streaming**: The agent incorporates the DB return array into its stream and types the final markdown balance table for the user.

**Key File/Code:** `banking_mcp/server.py` (SQLAlchemy logic).

---

## 🔁 Full Request Lifecycle (Sequence Diagram)

```
User types message
       ↓
api/main.py POST /chat
       ↓
mcp_client.select_relevant_tools()  ← LLM picks only necessary tools to save tokens
       ↓
agent_engine.stream_rag_chain()
       ↓
[Agent Mode: ReAct Loop]
  Think
  ├─ Action needed? Pick Tool
  │   └── Check if slots filled (password). If no → Ask user.
  ├─ Slots filled? Call Tool.
  │   └── [Approval Gate]
  │         ├─ Dangerous? → Raise ApprovalRequiredException → Pause agent → Show UI Card
  │         └─ Safe? → Run MCP JSON-RPC call over Stdio directly against banking_mcp
  └─ Observe Tool Result
       ↓
Agent formats Tool Result into friendly conversational tokens
       ↓
on_chat_model_stream events yield over SSE
       ↓
React UI reads stream and prints text
```

---

## 🏗️ The System Layer Cake

| Layer | Responsibility | Key Files |
| :--- | :--- | :--- |
| **UI** | Premium Interface, Approval Cards & SSE Streaming | `UI/src/App.jsx` |
| **Gateway** | API Routing, SSE bridging, Approval Direct Exec | `api/main.py` |
| **Brain** | ReAct LLM Loop | `api/agent_engine.py` |
| **Approval** | Human-in-the-Loop Gateway | `api/approval_tools.py`, `api/approval_handler.py` |
| **Transport** | MCP Client, Persistent Subprocess sessions, Stdio | `api/mcp_client.py` |
| **Banking** | Secure Isolated PostgreSQL Tooling | `banking_mcp/server.py` |
| **Storage** | Structured Transaction Data | `banking_mcp/models.py` |


---

Got it — you want it clean, student-facing, same format, no wording changes except removing “student” references + one paragraph homework at the end.

Here’s your corrected version:

⸻

📘 Database Module - Teaching Notes (Fullstack Course)

⸻

1️⃣ What is a Database?

Simple Definition:
	•	Stores and manages data
	•	Used in every real application

Real Examples:
	•	Instagram → stores users, posts, comments
	•	WhatsApp → stores users, messages, chats
	•	Netflix → stores movies, users, watch history

⸻

2️⃣ Types of Databases

SQL (Relational)
	•	Data stored in tables (rows + columns)
	•	Structured and organized
	•	Example: MySQL, PostgreSQL, SQLite

NoSQL
	•	Flexible structure (JSON format)
	•	Good for unstructured data
	•	Example: MongoDB, Firebase

For this course: We use MySQL

⸻

3️⃣ Basic Database Concepts

Concept	Meaning
Table	Collection of data (like Excel sheet)
Row	Single record
Column	Field/attribute (name, email, age)
Primary Key	Unique identifier (id)


⸻

4️⃣ CRUD Operations (Most Important)

CRUD = Create, Read, Update, Delete

Connect to Real Apps:

Operation	Real App Example
Create	User signs up → new account created
Read	User logs in → fetch user data
Update	User edits profile → update data
Delete	User deletes account → remove data


⸻

🔧 5. MySQL Installation (Hands-On - 20 mins)

⚠️ IMPORTANT: Don’t skip this. Make sure everyone completes it.

Step 1: Download MySQL
	•	Go to: https://dev.mysql.com/downloads/
	•	Download: MySQL Community Server

Step 2: Install MySQL
	•	Choose: Developer Default
	•	Set root password (write it down!)
	•	Port: 3306 (default)

Step 3: Install MySQL Workbench
	•	Comes with MySQL installer
	•	This is our GUI tool

Step 4: Open MySQL Workbench
	•	Create new connection
	•	Connection name: localhost
	•	Username: root
	•	Password: (the one you set)
	•	Test connection

✅ Checkpoint:

Ensure MySQL is installed and running properly.

⸻

💻 6. SQL Practice (Live Coding - 30 mins)

Follow along and type each query.

⸻

🟢 Create Database

CREATE DATABASE school;
USE school;

Explain:
	•	CREATE DATABASE → makes new database
	•	USE → select which database to work in

⸻

🟢 Create Table

CREATE TABLE students (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(50),
  age INT
);

Explain:
	•	id → unique number (auto increases)
	•	VARCHAR(50) → text (max 50 characters)
	•	INT → number

⸻

🟢 Insert Data (Create)

INSERT INTO students (name, age)
VALUES ('John', 20);

INSERT INTO students (name, age)
VALUES ('Sarah', 22);

INSERT INTO students (name, age)
VALUES ('Mike', 19);


⸻

🟢 Read Data

-- Get all records
SELECT * FROM students;

-- Get specific record
SELECT * FROM students WHERE id = 1;

-- Filter data
SELECT * FROM students WHERE age > 20;


⸻

🟢 Update Data

UPDATE students
SET age = 21
WHERE id = 1;

⚠️ Important: Always use WHERE — otherwise it updates ALL rows!

⸻

🟢 Delete Data

DELETE FROM students
WHERE id = 3;

⚠️ Important: Always use WHERE — otherwise it deletes ALL rows!

⸻

🖥️ 7. Connect Database to UI (MOST IMPORTANT)

This is where fullstack starts making sense.

⸻

The Flow:

User fills form (Frontend)
    ↓
Form sends data (API call)
    ↓
Backend receives data (Node.js/Express)
    ↓
Backend saves to MySQL
    ↓
MySQL stores data
    ↓
Backend fetches data
    ↓
Frontend displays data


⸻

Simple Demo:

Example: Registration Form
	1.	Frontend: HTML form (name, age)
	2.	Backend: Node.js API endpoint
	3.	Database: MySQL stores data
	4.	Display: Show data on webpage

⸻

🧪 8. In-Class Practice (15-20 mins)

⸻

Task: Product Management

-- Step 1: Create table
CREATE TABLE products (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100),
  price INT
);

-- Step 2: Insert 3 products
INSERT INTO products (name, price) VALUES ('Laptop', 50000);
INSERT INTO products (name, price) VALUES ('Mouse', 500);
INSERT INTO products (name, price) VALUES ('Keyboard', 1500);

-- Step 3: Show all products
SELECT * FROM products;

-- Step 4: Update product price
UPDATE products SET price = 55000 WHERE id = 1;

-- Step 5: Delete a product
DELETE FROM products WHERE id = 2;


⸻

📚 Homework

Create a users table with fields like id, name, and email, then insert at least 5 records and practice retrieving, updating, and deleting data using SQL queries. After that, build a simple frontend form (HTML or React) to add users and display them, and try connecting it with a backend (Node.js/Express) so that the data is stored in MySQL and shown on the UI.


---

