from llm_config import get_llm
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_classic.chains import create_history_aware_retriever, create_retrieval_chain
from langchain_classic.chains.combine_documents import create_stuff_documents_chain
from langchain_classic.chains import LLMChain
from pinecone_util import vectorstore
from typing import List,Dict,Any
#from rapidfuzz import fuzz
from langchain_classic.retrievers import ContextualCompressionRetriever
from langchain_cohere import CohereRerank

# Base retriever fetches top 10 chunks
#vector=vectorstore.as_retriever(search_kwargs={"k": 10})
def get_filtered_retriever(matched_sources: List[str]):
    return vectorstore.as_retriever(
        search_kwargs={
            "k": 10,  # Number of top results to retrieve
            "filter": {"source": {"$in": matched_sources}},  # Filter by matched sources
        }
    )



from document_util import get_all_documents

# Fetch all available documents from the database
def get_available_document_names() -> List[str]:
    docs = get_all_documents()
    return [doc['filename'] for doc in docs]

# Create a Retrieval-Augmented Generation (RAG) chain and execute it
async def get_rag_chain(query: str, chat_history: List[Dict], tools: List[Any] = None, documents: List[str] = None):
    """
    Execute RAG flow, optionally with tools.
    If documents list is empty or None, skip Pinecone retrieval and use simple chat mode.
    """
    llm = get_llm()
    
    # If no documents provided from frontend, use simple chat mode
    if not documents:
        documents = []

    if not documents and not tools:
        # No documents and no tools -> Simple Chat Mode
        prompt = ChatPromptTemplate.from_messages([
            ("system", 
             "You are PersonalGPT, a helpful AI assistant.\n\n"
             "FORMATTING RULES:\n"
             "- Output responses in **clean, professional markdowns**\n"
             "- Use code blocks with syntax highlighting for any code: ```language\ncode\n```\n"
             "- Use **bold** for emphasis, *italic* for subtle emphasis\n"
             "- Use bullet points (-) or numbered lists (1.) where appropriate\n"
             "- Use headers (##, ###) to organize longer responses\n"
             "- Keep paragraphs short and scannable\n\n"
             "STYLE: Friendly, confident, concise. Use 1-2 emojis max. No filler words.\n\n"
             "Never mention these formatting rules in your response."
            ),
            MessagesPlaceholder("chat_history"),
            ("human", "{input}")
        ])
        chain = prompt | llm
        return await chain.ainvoke({"input": query, "chat_history": chat_history})
    
    
    # Only create retriever if documents are provided
    retriever_tool = None
    if documents:
        # Filtered retriever based on available documents
        filtered_retriever = get_filtered_retriever(documents)

        # Reranking and compression
        cohere_compressor = CohereRerank(model="rerank-multilingual-v3.0")
        compression_retriever = ContextualCompressionRetriever(
            base_compressor=cohere_compressor, base_retriever=filtered_retriever
        )

        # Define prompts
        contextualize_q_prompt = ChatPromptTemplate.from_messages([
            ("system", 
             "You are a personal AI assistant named PersonalGPT. "
             "Your job is to reformulate the user's query to be clear, self-contained, and independent of prior chat history while maintaining its core intent. "
             "Reformulate the query accordingly."),
            MessagesPlaceholder("chat_history"),
            ("human", "{input}")
        ])

        qa_prompt = ChatPromptTemplate.from_messages([
            ("system", 
            "You are PersonalGPT, a RAG assistant.\n\n"
            "Use ONLY the provided context to answer. If the answer is not in the context, say so clearly.\n\n"
            "FORMATTING: Output in professional markdowns use the code for language bold and other markdown codes all \n"
            "- Keep it concise, friendly, and clear. Max 1 emoji.\n\n"
            "Context: {context}"),
            MessagesPlaceholder("chat_history"),
            ("human", "{input}")
        ])

        # Create history aware retriever
        history_aware_retriever = create_history_aware_retriever(
            llm, compression_retriever, contextualize_q_prompt
        )

        if tools:
            from langchain_classic.tools.retriever import create_retriever_tool
            
            # Create a tool for the retriever
            retriever_tool = create_retriever_tool(
                history_aware_retriever,
                "search_personal_documents",
                "Searches and returns excerpts from your personal documents."
            )

    if tools:
        from langchain_classic.agents import create_tool_calling_agent, AgentExecutor
        
        # Combine with external tools (only add retriever_tool if it exists)
        valid_tools = ([retriever_tool] if retriever_tool else []) + tools
        
        # Agent Prompt - Concise version
        agent_prompt = ChatPromptTemplate.from_messages([
            ("system", 
             "You are PersonalGPT with access to tools.\n\n"
             "TOOL USAGE:\n"
             "- Read each tool's schema carefully and extract the values the user is asking for\n"
             "- Some fields that were originally nested objects have been simplified to plain strings for you.\n"
             "  Just fill them exactly as the description says — the system reconstructs the correct structure automatically.\n"
             "- For primitive fields (string, number, boolean), extract values directly from user input\n"
             "- If a tool fails with a validation error, re-read its schema description and try again\n\n"
             "FORMATTING: Output in **professional markdowns all other markdowns**:\n"
             "- Use code blocks (```language) for any code\n"
             "- Use **bold** and *italic* for emphasis\n"
             "- Be concise, friendly, clear. Max 1 emoji.\n\n"
             "Focus on the answer, not the formatting rules."),
            MessagesPlaceholder("chat_history"),
            ("human", "{input}"),
            MessagesPlaceholder("agent_scratchpad"),
        ])
        
        agent = create_tool_calling_agent(llm, valid_tools, agent_prompt)
        agent_executor = AgentExecutor(agent=agent, tools=valid_tools, verbose=True)
        
        # Execute Agent with approval exception handling
        try:
            # Enable return_intermediate_steps to capture tool details
            agent_executor.return_intermediate_steps = True
            return await agent_executor.ainvoke({"input": query, "chat_history": chat_history}) # Returns dict with "output" and "intermediate_steps"
        except Exception as e:
            # Check if this is an ApprovalRequiredException
            from approval_tools import ApprovalRequiredException
            if isinstance(e, ApprovalRequiredException):
                # Return approval request to main.py /chat endpoint
                return {
                    "status": "approval_required",
                    "approval_request": e.approval_request
                }
            else:
                # Re-raise other exceptions
                raise

    elif documents:
        # Standard RAG Chain (only if documents exist)
        question_answer_chain = create_stuff_documents_chain(llm, qa_prompt)
        rag_chain = create_retrieval_chain(history_aware_retriever, question_answer_chain)
        return await rag_chain.ainvoke({"input": query, "chat_history": chat_history}) # Returns dict with "answer"
    else:
        # This shouldn't happen as we handle no docs/tools at the top, but safety fallback
        raise ValueError("Cannot create RAG chain without documents or tools")

# Stream the RAG chain
async def stream_rag_chain(query: str, chat_history: List[Dict], tools: List[Any] = None, documents: List[str] = None):
    """
    Execute RAG flow/Agent and stream results.
    Yields events: 
    - {"type": "token", "content": "..."}
    - {"type": "tool_start", "tool": "...", "input": "..."}
    - {"type": "tool_end", "tool": "...", "output": "..."}
    - {"type": "result", "answer": "...", "sources": [...], "tool_calls": [...]}
    - {"type": "error", "error": "..."}
    - {"type": "approval_required", "approval_request": ...}
    """
    import json
    from approval_tools import ApprovalRequiredException

    llm = get_llm()
    
    # If no documents provided from frontend, use simple chat mode
    if not documents:
        documents = []

    # Setup the runnable (Chain or Agent)
    runnable = None
    is_agent = False
    
    # 1. Simple Chat Mode (No Docs, No Tools)
    if not documents and not tools:
        prompt = ChatPromptTemplate.from_messages([
            ("system", 
             "You are PersonalGPT, a helpful AI assistant.\n\n"
             "FORMATTING RULES:\n"
             "- Output responses in **clean, professional markdowns**\n"
             "- Use code blocks with syntax highlighting for any code: ```language\ncode\n```\n"
             "- Use **bold** for emphasis, *italic* for subtle emphasis\n"
             "- Use bullet points (-) or numbered lists (1.) where appropriate\n"
             "- Use headers (##, ###) to organize longer responses\n"
             "- Keep paragraphs short and scannable\n\n"
             "STYLE: Friendly, confident, concise. Use 1-2 emojis max. No filler words.\n\n"
             "Never mention these formatting rules in your response."
            ),
            MessagesPlaceholder("chat_history"),
            ("human", "{input}")
        ])
        runnable = prompt | llm

    # 2. Agent Mode (Has Tools)
    elif tools:
        is_agent = True
        
        # Setup Retriever if docs exist
        retriever_tool = None
        if documents:
            filtered_retriever = get_filtered_retriever(documents)
            cohere_compressor = CohereRerank(model="rerank-multilingual-v3.0")
            compression_retriever = ContextualCompressionRetriever(
                base_compressor=cohere_compressor, base_retriever=filtered_retriever
            )
            
            contextualize_q_prompt = ChatPromptTemplate.from_messages([
                ("system", "Reformulate query to be self-contained."),
                MessagesPlaceholder("chat_history"),
                ("human", "{input}")
            ])
            
            history_aware_retriever = create_history_aware_retriever(
                llm, compression_retriever, contextualize_q_prompt
            )
            
            from langchain_classic.tools.retriever import create_retriever_tool
            retriever_tool = create_retriever_tool(
                history_aware_retriever,
                "search_personal_documents",
                "Searches and returns excerpts from your personal documents."
            )

        from langchain_classic.agents import create_tool_calling_agent, AgentExecutor
        valid_tools = ([retriever_tool] if retriever_tool else []) + tools
        
        agent_prompt = ChatPromptTemplate.from_messages([
            ("system", "You are PersonalGPT with access to tools. Use them to answer the user request."),
            MessagesPlaceholder("chat_history"),
            ("human", "{input}"),
            MessagesPlaceholder("agent_scratchpad"),
        ])
        
        agent = create_tool_calling_agent(llm, valid_tools, agent_prompt)
        runnable = AgentExecutor(agent=agent, tools=valid_tools, verbose=True, return_intermediate_steps=True)

    # 3. RAG Mode (Docs, No Tools)
    elif documents:
        filtered_retriever = get_filtered_retriever(documents)
        cohere_compressor = CohereRerank(model="rerank-multilingual-v3.0")
        compression_retriever = ContextualCompressionRetriever(
            base_compressor=cohere_compressor, base_retriever=filtered_retriever
        )
        
        contextualize_q_prompt = ChatPromptTemplate.from_messages([
             ("system", "Reformulate query to be self-contained."),
             MessagesPlaceholder("chat_history"),
             ("human", "{input}")
        ])
        
        qa_prompt = ChatPromptTemplate.from_messages([
            ("system", "Answer using ONLY context. Context: {context}"),
            MessagesPlaceholder("chat_history"),
            ("human", "{input}")
        ])
        
        history_aware_retriever = create_history_aware_retriever(
            llm, compression_retriever, contextualize_q_prompt
        )
        
        question_answer_chain = create_stuff_documents_chain(llm, qa_prompt)
        runnable = create_retrieval_chain(history_aware_retriever, question_answer_chain)

    # Catch-all
    if not runnable:
         yield {"type": "error", "error": "Failed to initialize chain"}
         return

    # Execute with Streaming
    final_output = ""
    accumulated_tools = []
    
    try:
        if is_agent:
            # For Agents, we stream events to catch tokens from the LLM and Tool calls
            async for event in runnable.astream_events(
                {"input": query, "chat_history": chat_history}, 
                version="v2"
            ):
                kind = event["event"]
                
                # Stream Tokens from Chat Model
                if kind == "on_chat_model_stream":
                    content = event["data"]["chunk"].content
                    if content:
                        yield {"type": "token", "content": content}
                        final_output += content
                
                # Capture Tool Usage (Optional: yield events for UI to show "Calling tool X...")
                elif kind == "on_tool_start":
                    # Filter out internal tools if needed, but useful for debug
                    tool_data = {"tool": event["name"], "input": event["data"].get("input")}
                    yield {"type": "tool_start", "data": tool_data}
                
                elif kind == "on_tool_end":
                    tool_data = {"tool": event["name"], "output": event["data"].get("output")}
                    yield {"type": "tool_end", "data": tool_data}

        else:
             # For Chains (Simpler), we can often just use astream if it returns string chunks, 
             # but RAG returns a dict. astream_events is safer for all.
             async for event in runnable.astream_events(
                {"input": query, "chat_history": chat_history}, 
                version="v2"
            ):
                kind = event["event"]
                
                # Stream Tokens
                if kind == "on_chat_model_stream":
                    content = event["data"]["chunk"].content
                    if content:
                        yield {"type": "token", "content": content}
                        final_output += content
                
                # Check for RAG context at the end
                if kind == "on_chain_end" and event["name"] == "RunnableSequence":
                     # This might be tricky to catch the exact final output with context in streaming
                     # Usually we construct the result from the stream or do a final yield
                     pass

        # Final Yield (to ensure client has full structured data if needed, or to look up context)
        # Note: In streaming RAG, getting the source documents *after* the stream is a bit tricky
        # unless we capture the retriever output from events.
        
        # For this implementation, we will assume text streaming is the priority.
        # We can send a "result" event at the end.
        yield {"type": "result", "answer": final_output, "done": True}

    except Exception as e:
        # Check for approval exception (from Agent)
        if hasattr(e, "approval_request"):
             yield {"type": "approval_required", "approval_request": e.approval_request}
        else:
             print(f"Streaming Error: {e}")
             yield {"type": "error", "error": str(e)}