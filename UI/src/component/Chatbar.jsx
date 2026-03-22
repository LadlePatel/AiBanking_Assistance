import { useState, useRef, useEffect } from "react";
import { IoIosRefreshCircle } from "react-icons/io";
import { Virtuoso } from "react-virtuoso";
import { Document, Page, pdfjs } from 'react-pdf';
import { motion, AnimatePresence } from "framer-motion";
import { getApiResponse, streamChat, API_URL, approveTool, denyTool } from "../api";
import RecSec from "./RecSec";
import SendSec from "./SendSec";
import TypingIndicator from "./TypingIndicator";
import ToolApprovalCard from "./ToolApprovalCard";

// Styles for react-pdf
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';

// Configure worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const Chatbar = ({
  selectedSession,
  isNewChat,
  resetNewChat,
  attachedFiles,
  activeDocument,
  selectedDocsForContext,
  onAddDocument,
  onSelectDocument, // For context selection (card click)
  onViewDocument, // For PDF viewing (eye icon)
  onDeleteDocument, // For deleting documents
  isSidebarLayout = true
}) => {
  const virtuosoRef = useRef(null);
  const textareaRef = useRef(null);
  const abortControllerRef = useRef(null); // Ref to store the abort controller
  const [allMessages, SetAllMessages] = useState([]);
  const [message, setMessage] = useState("");
  const [response, SetResponse] = useState(false);
  const [sessionId, setSessionId] = useState(`session_${Date.now()}`);

  // PDF State
  const [numPages, setNumPages] = useState(null);
  const [targetPage, setTargetPage] = useState(null); // Target page to scroll to
  const [currentHighlights, setCurrentHighlights] = useState([]); // Context highlights from AI



  // PDF Width Scaling
  const pdfWrapperRef = useRef(null);
  const [pdfWidth, setPdfWidth] = useState(null);


  // Approval State
  const [pendingApprovals, setPendingApprovals] = useState({}); // Map of approval_id -> approval_request

  // Responsive State
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window !== "undefined") {
      return window.innerWidth >= 768;
    }
    return true;
  });

  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Fetch Servers on Mount


  useEffect(() => {
    if (!activeDocument || !pdfWrapperRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        // Subtract padding (p-4 = 1rem = 16px * 2 = 32px) + slight buffer
        setPdfWidth(width - 40);
      }
    });

    resizeObserver.observe(pdfWrapperRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [activeDocument]);

  // Handle Target Page Scroll
  useEffect(() => {
    if (targetPage && numPages) {
      // Wait slightly for render
      setTimeout(() => {
        const pageElement = document.getElementById(`page_${targetPage}`);
        if (pageElement) {
          pageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
          // Highlight effect temporarily?
          pageElement.classList.add('ring-4', 'ring-yellow-300');
          setTimeout(() => pageElement.classList.remove('ring-yellow-300', 'ring-4'), 3000);
        }
      }, 500);
    }
  }, [targetPage, numPages, activeDocument]); // Re-run if doc changes to same doc but different page

  function onDocumentLoadSuccess({ numPages }) {
    setNumPages(numPages);
  }

  const handleCitationClick = (context) => {
    // context has { source, page, content }
    const docName = context.source;
    const foundDoc = attachedFiles.find(f => f.name === docName || f.filename === docName);

    if (foundDoc) { 
      onViewDocument?.(foundDoc);
      setTargetPage(context.page);
    } else {
      console.warn("Cited document not found in attached files:", docName);
    }
  };

  // Handle New Chat
  useEffect(() => {
    if (isNewChat) {
      SetAllMessages([]);
      setSessionId(`session_${Date.now()}`);

      // attachedFiles reset handled in App.js
      resetNewChat();
    }
  }, [isNewChat, resetNewChat]);

  // Load Session
  useEffect(() => {
    if (selectedSession && selectedSession !== sessionId) {
      setSessionId(selectedSession);
      const savedMessages = JSON.parse(localStorage.getItem(`messages_${selectedSession}`) || "[]");
      SetAllMessages(savedMessages);
    }
  }, [selectedSession, sessionId]);



  const renderMessage = (index) => {
    const msg = allMessages[index];
    if (msg) {
      const showTyping = msg.gpt_response === "" && msg.user_query && !msg.approval_request;
      return (
        <div key={index} className="w-full max-w-4xl mx-auto mt-4 px-2 md:px-0">
          {msg.user_query && <SendSec message={{ user_query: msg.user_query, created_at: msg.created_at || Date.now() }} />}
          {msg.approval_request && (
            <div className="max-w-[85%] mb-3 mx-auto md:mx-0">
              <ToolApprovalCard
                toolName={msg.approval_request.tool.name}
                description={msg.approval_request.tool.description}
                serverName={msg.approval_request.tool.server}
                arguments={msg.approval_request.arguments}
                approvalId={msg.approval_request.approval_id}
                onApprove={() => handleApprove(msg.approval_request.approval_id)}
                onDeny={() => handleDeny(msg.approval_request.approval_id)}
                status={msg.approval_request.status || "pending"}
                result={msg.approval_request.result}
              />
            </div>
          )}
          {msg.gpt_response && msg.gpt_response !== "" && (
            <RecSec
              message={msg}
              onCitationClick={handleCitationClick}
            />
          )}
          {showTyping && <TypingIndicator />}
        </div>
      );
    }
    // Virtuoso requires every index to return a node — return empty placeholder
    return <div key={index} />;
  };

  const saveMessageToStorage = (sId, msgs) => {
    localStorage.setItem(`messages_${sId}`, JSON.stringify(msgs));
    const sessions = JSON.parse(localStorage.getItem("chatSessions") || "[]");
    const existingIndex = sessions.findIndex(s => s.id === sId);
    const title = msgs[0]?.user_query?.substring(0, 30) || "New Chat";
    if (existingIndex >= 0) {
      sessions[existingIndex] = { ...sessions[existingIndex], timestamp: Date.now(), title: title };
    } else {
      sessions.push({ id: sId, timestamp: Date.now(), title: title });
    }
    localStorage.setItem("chatSessions", JSON.stringify(sessions));
    window.dispatchEvent(new Event("sessionsUpdated"));
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey && message.trim() !== "" && !response) {
      e.preventDefault();
      sendMessage(message);
    }
  };

  const handleApprove = async (approvalId) => {
    // Update UI to show executing status
    SetAllMessages(prev => prev.map(msg => {
      if (msg.approval_request?.approval_id === approvalId) {
        return {
          ...msg,
          approval_request: {
            ...msg.approval_request,
            status: 'executing'
          }
        };
      }
      return msg;
    }));

    // Call approval API
    let approveResult;
    try {
      approveResult = await approveTool(approvalId);
    } catch (err) {
      console.error("Failed to approve tool:", err);
      setPendingApprovals(prev => {
        const next = { ...prev };
        delete next[approvalId];
        return next;
      });
      SetAllMessages(prev => {
        const updated = prev.map(msg => {
          if (msg.approval_request?.approval_id === approvalId) {
            return {
              ...msg,
              approval_request: { ...msg.approval_request, status: "error" },
              gpt_response: `❌ Tool execution failed: ${err?.message || "Unknown error"}`
            };
          }
          return msg;
        });
        saveMessageToStorage(sessionId, updated);
        return updated;
      });
      return;
    }

    // Remove from pending regardless of outcome to clear state
    setPendingApprovals(prev => {
      const newApprovals = { ...prev };
      delete newApprovals[approvalId];
      return newApprovals;
    });

    if (!approveResult.success) {
      console.error("Failed to approve tool:", approveResult.message);
      // Show error
      SetAllMessages(prev => prev.map(msg => {
        if (msg.approval_request?.approval_id === approvalId) {
          return {
            ...msg,
            approval_request: {
              ...msg.approval_request,
              status: 'denied' // Using denied style for error to keep card visible
            },
            gpt_response: `❌ Tool execution failed: ${approveResult.message || 'Unknown error'}`
          };
        }
        return msg;
      }));
      return;
    }

    // Success! Tool already executed in the backend.
    const summary = approveResult.data.answer || "Tool executed successfully.";

    // Update message with final answer and keep card visible
    SetAllMessages(prev => {
      const updatedMessages = prev.map(msg => {
        if (msg.approval_request?.approval_id === approvalId) {
          return {
            ...msg,
            // usage: persist the card with 'approved' status
            approval_request: {
              ...msg.approval_request,
              status: 'approved',
              result: approveResult.data.result // Store result
            },
            gpt_response: summary, // Use backend summary
            highlighted_contexts: []
          };
        }
        return msg;
      });
      saveMessageToStorage(sessionId, updatedMessages);
      return updatedMessages;
    });
  };

  const handleDeny = async (approvalId) => {
    // Call deny API
    let result;
    try {
      result = await denyTool(approvalId);
    } catch (err) {
      console.error("Failed to deny tool:", err);
      setPendingApprovals(prev => {
        const next = { ...prev };
        delete next[approvalId];
        return next;
      });
      return;
    }

    if (result.success) {
      // Remove from pending and update message  
      setPendingApprovals(prev => {
        const newApprovals = { ...prev };
        delete newApprovals[approvalId];
        return newApprovals;
      });

      // Update the message to show denial and keep card visible
      SetAllMessages(prev => {
        const updatedMessages = prev.map(msg => {
          if (msg.approval_request?.approval_id === approvalId) {
            return {
              ...msg,
              approval_request: {
                ...msg.approval_request,
                status: 'denied'
              }
              // gpt_response intentionally left as-is (empty) —
              // the ToolApprovalCard denied banner already tells the user.
            };
          }
          return msg;
        });
        saveMessageToStorage(sessionId, updatedMessages);
        return updatedMessages;
      });
    } else {
      console.error("Failed to deny tool:", result.message);
    }
  };

  const sendMessage = async (inputMessage) => {
    const rawMessage = typeof inputMessage === 'string' ? inputMessage : message;
    // Strip @mentions out — server routing is handled by selectedServers array,
    // the LLM should never see raw "@server-name" text in the prompt.
    const finalMessage = rawMessage.replace(/@\S+/g, '').replace(/\s+/g, ' ').trim();
    if (!finalMessage) return;
    SetResponse(true);
    setMessage("");

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = '24px';
    }

    const tempUserMsg = {
      session_id: sessionId,
      user_query: finalMessage,
      gpt_response: "",
      created_at: Date.now(),
    };

    const updatedMessagesInitial = [...allMessages, tempUserMsg];
    SetAllMessages(updatedMessagesInitial);
    saveMessageToStorage(sessionId, updatedMessagesInitial);
    const history = allMessages
      .flatMap((msg) => [
        msg.user_query ? { role: "human", content: msg.user_query } : null,
        msg.gpt_response ? { role: "ai", content: msg.gpt_response } : null,
      ])
      .filter(Boolean);
    // Cancel any previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    // Create new controller
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      // Only send documents that are selected for context
      const selectedDocsToSend = selectedDocsForContext
        .map((doc, index) => {
          const docName = doc.name || doc.filename;
          return docName;
        })
        .filter(Boolean);

      // Call Streaming API
      await streamChat({
        message: finalMessage,
        sessionId: sessionId,
        history: history,
        sourceDocuments: selectedDocsToSend,


        // Pass signal
        signal: abortController.signal,

        // 1. Handle Token (Typing Effect)
        onToken: (token) => {
          SetAllMessages(prev => {
            const newArr = [...prev];
            const lastMsg = newArr[newArr.length - 1];
            // Append token to current response
            newArr[newArr.length - 1] = {
              ...lastMsg,
              gpt_response: (lastMsg.gpt_response || "") + token
            };
            return newArr;
          });
        },

        // 2. Handle Tool Usage
        onToolUsed: (toolEvent) => {
          console.log("Tool used:", toolEvent);
        },

        // 3. Handle Approval
        onApprovalRequired: (approvalReq) => {
          setPendingApprovals(prev => ({
            ...prev,
            [approvalReq.approval_id]: approvalReq
          }));

          const approvalMessage = {
            session_id: sessionId,
            user_query: finalMessage,
            gpt_response: "",
            approval_request: approvalReq,
            created_at: Date.now(),
          };

          SetAllMessages(prev => {
            const newArr = [...prev];
            newArr[newArr.length - 1] = approvalMessage;
            saveMessageToStorage(sessionId, newArr);
            return newArr;
          });
          SetResponse(false);
          abortControllerRef.current = null;
        },

        // 4. Handle Error
        onError: (err) => {
          if (err !== 'AbortError') { // api.js handles this check but double check string
            console.error("Stream Error:", err);
            SetAllMessages(prev => {
              const newArr = [...prev];
              newArr[newArr.length - 1] = {
                ...newArr[newArr.length - 1],
                gpt_response: prev[prev.length - 1].gpt_response + `\n\n❌ Error: ${err}`,
              };
              return newArr;
            });
          }
          SetResponse(false);
          abortControllerRef.current = null;
        },

        // 5. Completion (Finalize)
        onComplete: (finalResult) => {
          SetResponse(false);
          abortControllerRef.current = null;

          if (!finalResult) return;

          SetAllMessages(prev => {
            const newArr = [...prev];
            const lastMsg = newArr[newArr.length - 1];

            const updatedMsg = {
              ...lastMsg,
              gpt_response: finalResult.answer,
              highlighted_contexts: finalResult.highlighted_contexts?.map((context) => ({
                page: context.page,
                source: context.source,
                content: context.highlighted_content,
              })) || [],
              tool_calls: finalResult.tool_calls || [],
            };

            newArr[newArr.length - 1] = updatedMsg;
            setCurrentHighlights(updatedMsg.highlighted_contexts);
            saveMessageToStorage(sessionId, newArr);
            return newArr;
          });
        }
      });

    } catch (error) {
      // Abort error check at top level just in case
      if (error.name !== 'AbortError') {
        console.error("Error sending message:", error);
        SetAllMessages(prev => {
          const newArr = [...prev];
          newArr[newArr.length - 1] = {
            ...newArr[newArr.length - 1],
            gpt_response: "Sorry, there was an error processing your request.",
          };
          return newArr;
        });
      }
      SetResponse(false);
      abortControllerRef.current = null;
    }
  };

  const stopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      SetResponse(false);
    }
  };

  const handleInputChange = async (e) => {
    const val = e.target.value;
    setMessage(val);

    // Auto-resize textarea
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
  };

  // --- Render Functions ---

  const renderChatInterface = (isSidebar = false) => (
    <div className={`flex flex-col h-full bg-[var(--bg-primary)]`}>
      {/* Messages Area - Full width */}
      <div className="flex-1 w-full pt-2">
        {allMessages.length > 0 ? (
          <Virtuoso
            ref={virtuosoRef}
            totalCount={allMessages.length}
            itemContent={(index) => renderMessage(index)}
            followOutput="auto"
            atBottomThreshold={50}
            className="h-full scroll-smooth"
            alignToBottom={true}
            components={{
              Header: () => <div className="h-4 " />, // Top spacing
              Footer: () => <div className="h-4 md:h-4" /> // Bottom spacing for input area
            }}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center px-4 max-w-4xl mx-auto w-full h-full pb-20">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="text-center mb-12"
            >
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-500 text-[10px] font-bold uppercase tracking-[0.2em] mb-6">
                <span className="material-symbols-rounded !text-sm">verified_user</span>
                Secure Banking Environment
              </div>
              <h1 className="text-4xl md:text-5xl font-display font-bold text-[var(--text-primary)] mb-4 tracking-tight">
                Good morning, <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-amber-600">Premium Member</span>
              </h1>
              <p className="text-[var(--text-secondary)] text-lg font-light max-w-lg mx-auto leading-relaxed">
                I'm your AI Banking Assistant. How can I facilitate your financial operations today?
              </p>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
              {[
                { icon: 'account_balance', label: 'Financial Overview', desc: 'Detailed analysis of your assets and liabilities' },
                { icon: 'payments', label: 'Internal Transfer', desc: 'Securely move funds between your accounts' },
                { icon: 'analytics', label: 'Investment Insights', desc: 'Market trends and portfolio performance' },
                { icon: 'security', label: 'Security Audit', desc: 'Review recent suspicious activities' }
              ].map((item, i) => (
                <motion.button
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 * i + 0.5 }}
                  onClick={() => sendMessage(item.label)}
                  className="flex items-start gap-4 p-5 rounded-2xl bg-[var(--bg-surface-subtle)] border border-[var(--border-subtle)] hover:bg-[var(--bg-glass)] hover:border-amber-500/30 transition-all text-left group"
                >
                  <div className="size-10 rounded-xl bg-[var(--bg-surface-subtle)] flex items-center justify-center text-amber-500 group-hover:bg-amber-500 group-hover:text-white transition-all shadow-lg shrink-0">
                    <span className="material-symbols-rounded !text-xl">{item.icon}</span>
                  </div>
                  <div>
                    <div className="font-bold text-[var(--text-primary)] mb-1">{item.label}</div>
                    <div className="text-xs text-[var(--text-muted)] group-hover:text-[var(--text-secondary)] transition-colors">{item.desc}</div>
                  </div>
                </motion.button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Input Area - Fixed at bottom */}
      <div className="w-full bg-gradient-to-t from-[var(--bg-primary)] via-[var(--bg-primary)] to-transparent pt-2 px-4 md:px-8 pb-8">
        <div className="max-w-4xl mx-auto relative">
          <div className="relative glass border border-[var(--border-subtle)] rounded-[2rem] shadow-2xl shadow-black/5 overflow-hidden focus-within:border-amber-500/40 focus-within:ring-4 focus-within:ring-amber-500/5 transition-all duration-500">
            {/* Header / Document List */}
            <AnimatePresence>
              {attachedFiles.length > 0 && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="px-6 py-4 flex flex-wrap gap-3 border-b border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)]"
                >
                  {attachedFiles.map((file, index) => {
                    const isViewing = activeDocument?.name === file.name || activeDocument?.filename === file.filename;
                    const isSelectedContext = selectedDocsForContext?.some(
                      doc => (doc.name || doc.filename) === (file.name || file.filename)
                    );

                    return (
                      <motion.div
                        layout
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        key={index}
                        className={`group relative flex items-center gap-3 border rounded-xl px-3 py-2 transition-all cursor-pointer ${
                          isSelectedContext 
                          ? 'bg-amber-500/10 border-amber-500/40' 
                          : 'bg-[var(--bg-surface-subtle)] border-[var(--border-subtle)] hover:border-amber-500/30'
                        }`}
                        onClick={() => onSelectDocument?.(file)}
                      >
                        <div className={`size-8 rounded-lg flex items-center justify-center ${isSelectedContext ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20' : 'bg-emerald-500/10 text-emerald-500'}`}>
                          <span className="material-symbols-rounded !text-lg">description</span>
                        </div>
                        <div className="flex flex-col pr-8">
                          <span className="text-[10px] font-bold text-[var(--text-primary)] truncate max-w-[120px]">{file.name || file.filename}</span>
                          <span className="text-[9px] text-[var(--text-muted)] uppercase tracking-wider">{isSelectedContext ? 'Context Active' : 'PDF Document'}</span>
                        </div>
                        
                        <div className="absolute right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isViewing) onViewDocument?.(null);
                              else onViewDocument?.(file);
                            }}
                            className={`size-6 rounded-lg flex items-center justify-center transition-all ${isViewing ? 'bg-amber-500 text-white' : 'bg-black/40 text-[var(--text-secondary)] hover:text-white'}`}
                          >
                            <span className="material-symbols-rounded !text-xs">{isViewing ? 'visibility_off' : 'visibility'}</span>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteDocument?.(file.id || file.fileId);
                            }}
                            className="size-6 rounded-lg bg-black/40 text-[var(--text-secondary)] hover:text-red-400 flex items-center justify-center transition-all"
                          >
                            <span className="material-symbols-rounded !text-xs">delete</span>
                          </button>
                        </div>
                      </motion.div>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Input Row */}
            <div className="flex items-end gap-2 p-3 md:p-4">
              <button 
                onClick={onAddDocument}
                className="size-10 rounded-2xl flex items-center justify-center bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)] hover:bg-[var(--border-subtle)] hover:text-[var(--text-primary)] transition-all group shrink-0"
              >
                <span className="material-symbols-rounded group-hover:scale-110 transition-transform">add_circle</span>
              </button>
              
              <textarea
                ref={textareaRef}
                value={message}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder={
                  Object.keys(pendingApprovals).length > 0 
                  ? "Action required above..." 
                  : (allMessages.some(m => m.approval_request?.status === 'executing') 
                  ? "Executing secure protocol..." 
                  : "Describe your request or ask a question...")
                }
                rows={1}
                disabled={Object.keys(pendingApprovals).length > 0 || allMessages.some(m => m.approval_request?.status === 'executing')}
                className="flex-1 bg-transparent text-[var(--text-primary)] placeholder-[var(--text-muted)] py-2.5 resize-none max-h-48 overflow-y-auto font-sans leading-relaxed text-[15px]"
              />

              <div className="flex items-center gap-2 shrink-0">
                {response ? (
                  <button
                    onClick={stopGeneration}
                    className="size-10 rounded-2xl flex items-center justify-center bg-[var(--text-primary)] text-[var(--bg-primary)] hover:bg-amber-500 hover:text-white transition-all shadow-lg active:scale-95"
                  >
                    <span className="material-symbols-rounded font-bold !text-xl">stop</span>
                  </button>
                ) : (
                  <button
                    onClick={() => sendMessage(message)}
                    disabled={(!message.trim()) || Object.keys(pendingApprovals).length > 0 || allMessages.some(m => m.approval_request?.status === 'executing')}
                    className={`size-10 rounded-2xl flex items-center justify-center transition-all shadow-lg active:scale-95 ${
                      message.trim() 
                      ? 'bg-amber-500 text-white hover:bg-amber-400 hover:shadow-amber-500/20' 
                      : 'bg-[var(--bg-surface-subtle)] text-[var(--text-muted)]/30 cursor-not-allowed'
                    }`}
                  >
                    <span className="material-symbols-rounded font-bold">arrow_upward</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Footer Text */}
          <div className="text-center mt-4">
             <p className="text-[10px] uppercase tracking-[0.3em] font-bold text-[var(--text-muted)] opacity-30">AiBank Powered by Quantum Agent Engine v3.0</p>
          </div>
        </div>
      </div>
    </div >
  );

  const renderDocumentViewer = () => (
    <div className="h-full flex flex-col bg-[var(--bg-primary)] border-l border-[var(--border-subtle)]">
      <div className="px-6 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between bg-[var(--bg-glass)] backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="size-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-500">
            <span className="material-symbols-rounded !text-lg">description</span>
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-bold text-[var(--text-primary)] truncate max-w-[200px]">
              {activeDocument?.name || activeDocument?.filename || 'Document Viewer'}
            </span>
            <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest font-bold">
              Secure PDF Environment
            </span>
          </div>
        </div>
        <button 
          onClick={() => onViewDocument(null)}
          className="size-8 rounded-lg bg-white/5 text-[var(--text-secondary)] hover:bg-red-500 hover:text-white transition-all flex items-center justify-center"
        >
          <span className="material-symbols-rounded !text-sm">close</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar flex justify-center p-4 md:p-8 bg-[var(--bg-primary)]">
        {!activeDocument ? (
          <div className="flex flex-col items-center justify-center text-[var(--text-muted)] h-full space-y-4">
             <div className="size-16 rounded-2xl bg-[var(--bg-surface-subtle)] flex items-center justify-center">
               <span className="material-symbols-rounded text-3xl opacity-20 text-[var(--text-primary)]">dock_to_left</span>
             </div>
             <p className="text-sm font-light">Select a document to initiate analysis</p>
          </div>
        ) : (
          <div ref={pdfWrapperRef} className="w-full max-w-4xl animate-in fade-in slide-in-from-bottom-4 duration-700">
            <Document
              file={`${API_URL}/files/${activeDocument.name || activeDocument.filename}`}
              onLoadSuccess={onDocumentLoadSuccess}
              loading={
                <div className="flex flex-col items-center justify-center mt-20 gap-4">
                  <div className="size-12 rounded-full border-2 border-amber-500/20 border-t-amber-500 animate-spin" />
                  <span className="text-xs text-[var(--text-muted)] uppercase tracking-widest">Deciphering...</span>
                </div>
              }
              error={
                <div className="text-red-400 mt-20 text-center border border-red-500/20 bg-red-500/5 p-6 rounded-2xl">
                  <span className="material-symbols-rounded text-3xl mb-2 block">warning</span>
                  <p className="font-bold">Access Denied</p>
                  <p className="text-xs opacity-60">Unable to establish secure connection to document.</p>
                </div>
              }
              className="max-w-full"
            >
              {Array.from(new Array(numPages), (el, index) => {
                const pageNum = index + 1;
                const pageHighlights = currentHighlights.filter(h => h.page === pageNum);
                const hasHighlight = pageHighlights.length > 0;

                return (
                  <div key={`page_${pageNum}`} id={`page_${pageNum}`} className="mb-8 relative rounded-xl overflow-hidden shadow-2xl ring-1 ring-[var(--border-subtle)] group">
                    {hasHighlight && (
                      <div className="absolute top-4 right-4 z-10 bg-amber-500 text-white px-4 py-1.5 rounded-full text-[10px] font-bold shadow-xl shadow-amber-500/20 flex items-center gap-2 animate-pulse">
                        <span className="material-symbols-rounded !text-[14px]">local_library</span>
                        SECURE CITATION
                      </div>
                    )}
                    <Page
                      pageNumber={pageNum}
                      width={pdfWidth || (isDesktop ? 700 : window.innerWidth - 64)}
                      renderTextLayer={false}
                      renderAnnotationLayer={false}
                      className="transition-transform duration-500 group-hover:scale-[1.01]"
                    />
                  </div>
                );
              })}
            </Document>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex h-full w-full relative overflow-hidden">
      {/* PDF Viewer - Slides in from right */}
      <AnimatePresence>
        {activeDocument && (
          <motion.div
            className="h-full bg-[var(--bg-secondary)] overflow-hidden border-r border-[var(--border-medium)]"
            initial={{
              width: 0,
              opacity: 0
            }}
            animate={{
              width: isDesktop ? '55%' : '100%',
              opacity: 1
            }}
            exit={{
              width: 0,
              opacity: 0
            }}
            transition={{
              duration: 0.3,
              ease: "easeInOut"
            }}
          >
            {renderDocumentViewer()}
          </motion.div>
        )}
      </AnimatePresence>
      {/* Chat Area - Full width scrollable container */}
      <motion.div
        className="h-full"
        initial={false}
        animate={{
          width: activeDocument
            ? (isDesktop ? '45%' : '0%') // Desktop: 45%, Mobile: 0% (hidden behind PDF) 
            : '100%'
        }}
        transition={{
          duration: 0.3,
          ease: "easeInOut"
        }}
        style={{
          display: (activeDocument && !isDesktop) ? 'none' : 'block' // Ensure it's hidden from DOM/access on mobile
        }}
      >
        {renderChatInterface(false)}
      </motion.div>
    </div>
  );
};

export default Chatbar;