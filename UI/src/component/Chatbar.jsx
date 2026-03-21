import { useState, useRef, useEffect } from "react";
import { IoIosRefreshCircle } from "react-icons/io";
import { Virtuoso } from "react-virtuoso";
import { Document, Page, pdfjs } from 'react-pdf';
import { motion, AnimatePresence } from "framer-motion";
import { getApiResponse, streamChat, API_URL, listMcpServers, approveTool, denyTool } from "../api";
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

  // Server Selection State
  const [availableServers, setAvailableServers] = useState([]);
  const [showServerPopup, setShowServerPopup] = useState(false);
  const [filteredServers, setFilteredServers] = useState([]);
  const [selectedServers, setSelectedServers] = useState([]); // List of server names

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

  const questionList = [
    "Summarize this document",
    "Key points",
    "Find contact details",
    "Experience listed?",
    "Main topic?",
    "Skills mentioned?",
    "Brief overview",
    "Terms and conditions"
  ];

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
      setSelectedServers([]); // Reset selected servers
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
    if (e.key === "Enter" && !e.shiftKey && message.trim() !== "" && !response && !showServerPopup) {
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
    setShowServerPopup(false);

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
        selectedServers: selectedServers,

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

    // Detect @ trigger
    const lastWord = val.split(' ').pop();

    if (lastWord.startsWith('@')) {
      // Lazy load servers if not already loaded
      if (availableServers.length === 0) {
        const servers = await listMcpServers();
        // Dedup servers by name just in case
        const uniqueServers = Array.from(new Map(servers.map(item => [item.name, item])).values());

        setAvailableServers(uniqueServers);
        // Re-filter immediately after fetching
        const query = lastWord.slice(1).toLowerCase();
        const matches = uniqueServers.filter(s => s.name.toLowerCase().includes(query));
        setFilteredServers(matches);
        setShowServerPopup(matches.length > 0);
      } else {
        const query = lastWord.slice(1).toLowerCase();
        const matches = availableServers.filter(s => s.name.toLowerCase().includes(query));
        setFilteredServers(matches);
        setShowServerPopup(matches.length > 0);
      }
    } else {
      setShowServerPopup(false);
    }
  };

  const selectServer = (serverName) => {
    const words = message.split(' ');
    // Replace the last word (the trigger)
    words.pop();
    const newMessage = [...words, `@${serverName} `].join(' ');

    setMessage(newMessage);
    setShowServerPopup(false);

    if (!selectedServers.includes(serverName)) {
      setSelectedServers([...selectedServers, serverName]);
    }
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
          <div className="text-center py-8 text-[var(--text-muted)] text-sm h-full flex flex-col items-center justify-center">
            <div className="w-16 h-16 bg-gradient-to-br from-[var(--accent-color)] to-[var(--accent-color-hover)] rounded-2xl flex items-center justify-center mb-6 shadow-lg">
              <span className="material-symbols-rounded text-white" style={{ fontSize: '32px' }}>auto_awesome</span>
            </div>
            <h3 className="text-2xl font-semibold mb-2 text-[var(--text-primary)]">PersonalGPT</h3>
            <p className="text-[var(--text-secondary)] mb-8">Ask me anything...</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full max-w-2xl px-4 mt-8">
              {questionList.slice(0, 4).map((q, i) => (
                <button key={i} onClick={() => sendMessage(q)} className="p-4 bg-[var(--bg-input)] hover:bg-[var(--bg-user-msg)] rounded-xl text-sm text-[var(--text-primary)] text-left transition-all border border-[var(--border-medium)] hover:border-[var(--accent-color)]/30 group">
                  <div className="font-medium mb-1">{q}</div>
                  <div className="text-xs text-[var(--text-muted)] group-hover:text-[var(--text-secondary)]">Sample prompt →</div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Input Area - Fixed at bottom */}
      <div className="w-full bg-gradient-to-t from-[var(--bg-primary)] via-[var(--bg-primary)] to-transparent pt-2 px-4">
        <div className="max-w-4xl mx-auto relative">

          {/* Server Popup */}
          {showServerPopup && (
            <div className="absolute bottom-full left-0 mb-2 w-64 bg-[var(--bg-input)] rounded-xl shadow-2xl border border-[var(--border-medium)] overflow-hidden z-50">
              <div className="p-2 bg-[var(--bg-secondary)] text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">
                Select MCP Server
              </div>
              <div className="max-h-48 overflow-y-auto custom-scrollbar">
                {filteredServers.map((server, i) => (
                  <button
                    key={i}
                    onClick={() => selectServer(server.name)}
                    className="w-full text-left px-4 py-2.5 hover:bg-[var(--bg-user-msg)] text-sm text-[var(--text-primary)] transition-colors flex items-center justify-between"
                  >
                    <span className="font-medium">{server.name}</span>
                    <span className="text-[10px] text-[var(--text-muted)]">{server.command ? 'Local' : 'Remote'}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Main Input Container - ChatGPT Style Grid */}
          <div className="relative bg-[var(--bg-input)] border-2 border-[var(--border-medium)] transition-all p-2 md:p-2.5 grid grid-cols-[auto_1fr_auto] grid-rows-[1fr_auto]" style={{ borderRadius: '28px' }}>

            {/* Leading (+ Button) */}
            <div className="flex items-center justify-center">
              <button
                onClick={onAddDocument}
                className="flex items-center justify-center w-9 h-9 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors rounded-lg hover:bg-[var(--bg-user-msg)]"
                aria-label="Add files and more"
              >
                <span className="material-symbols-rounded text-[20px]">add</span>
              </button>
            </div>

            {/* Primary (Textarea) */}
            <div className="flex items-center min-h-[40px]">
              <textarea
                ref={textareaRef}
                value={message}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                rows="1"
                disabled={Object.keys(pendingApprovals).length > 0 || allMessages.some(m => m.approval_request?.status === 'executing')}
                className="w-full bg-transparent border-none text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:ring-0 outline-none resize-none max-h-[200px] py-0 custom-scrollbar text-[15px]"
                placeholder={Object.keys(pendingApprovals).length > 0 ? "Action required..." : (allMessages.some(m => m.approval_request?.status === 'executing') ? "Executing tool..." : "Ask anything")}
                style={{ minHeight: '24px', lineHeight: '24px' }}
              />
            </div>

            {/* Trailing (Send Button) */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => response ? stopGeneration() : sendMessage(message)}
                disabled={(message.trim() === "" && !response) || Object.keys(pendingApprovals).length > 0 || allMessages.some(m => m.approval_request?.status === 'executing')}
                className={`flex items-center justify-center w-9 h-9 rounded-full transition-all ${response
                  ? 'bg-[var(--text-primary)] text-[var(--bg-primary)] hover:opacity-80' // Black square for stop
                  : (message.trim() !== ""
                    ? 'bg-[var(--accent-color)] text-white hover:opacity-70 shadow-md'
                    : 'text-[var(--text-muted)] cursor-not-allowed bg-transparent'
                  )
                  }`}
                aria-label={response ? "Stop generation" : "Send message"}
              >
                {response ? (
                  // Stop Icon (Square)
                  <div className="w-3 h-3 bg-current rounded-[1px]" />
                ) : (
                  <span className="material-symbols-rounded text-[18px]">send</span>
                )}
              </button>
            </div>

            {/* Footer (Document Cards) */}
            <div className="col-span-3 flex flex-col gap-2">
              {attachedFiles.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {attachedFiles.map((file, index) => {
                    const isViewing = activeDocument?.name === file.name || activeDocument?.filename === file.filename;
                    const isSelectedForContext = selectedDocsForContext?.some(
                      doc => (doc.name || doc.filename) === (file.name || file.filename)
                    );

                    return (
                      <div
                        key={index}
                        className={`group relative px-1 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 ${isSelectedForContext
                          ? 'border-[var(--border-medium)] bg-[var(--accent-color)]'
                          : 'border-[var(--border-subtle)] hover:border-[var(--border-medium)] hover:bg-[var(--bg-input)]'
                          }`}
                        onClick={() => {
                          // Card click = Toggle context selection only (doesn't open PDF)
                          onSelectDocument?.(file);
                        }}
                      >
                        {/* File Icon + Name */}
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className="material-symbols-rounded text-[14px] text-[var(--text-secondary)]">description</span>
                          <p className="text-xs text-[var(--text-primary)] truncate">
                            {file.name || file.filename}
                          </p>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              // Eye icon = Toggle PDF viewer only (independent of context)
                              if (isViewing) {
                                onViewDocument?.(null); // Close PDF viewer
                              } else {
                                onViewDocument?.(file); // Open PDF viewer
                              }
                            }}
                            className={`flex items-center justify-center w-6 h-6 rounded-lg transition-colors ${isViewing
                              ? 'bg-[var(--accent-color)] text-white'
                              : 'bg-[var(--bg-input)] hover:bg-[var(--bg-user-msg)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                              }`}
                            aria-label={isViewing ? "Close document" : "View document"}
                            title={isViewing ? "Close document" : "View document"}
                          >
                            <span className="material-symbols-rounded text-[14px]">
                              {isViewing ? 'visibility_off' : 'visibility'}
                            </span>
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteDocument?.(file.id || file.fileId);
                            }}
                            className="flex items-center justify-center w-6 h-6 rounded-lg bg-[var(--bg-input)] hover:bg-red-500/20 text-[var(--text-secondary)] hover:text-red-400 transition-colors"
                            aria-label="Delete document"
                            title="Delete document"
                          >
                            <span className="material-symbols-rounded text-[14px]">delete</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* MCP Server Pills */}
              {selectedServers.length > 0 && (
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                  {selectedServers.map(s => (
                    <div
                      key={s}
                      className="flex items-center gap-1.5 text-xs font-medium text-[var(--accent-color)] bg-[var(--accent-color)]/10 px-3 py-1.5 rounded-full border border-[var(--accent-color)]/20 shrink-0 group"
                    >
                      <span className="material-symbols-rounded text-[14px]">dns</span>
                      <span className="max-w-32 truncate">{s}</span>
                      <button
                        onClick={() => setSelectedServers(selectedServers.filter(x => x !== s))}
                        className="hover:text-[var(--accent-color-hover)] transition-colors"
                        aria-label={`Remove ${s}`}
                      >
                        <span className="material-symbols-rounded text-[14px]">close</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Footer Text */}
          <div className="text-center mt-3">
            <p className="text-[11px] text-[var(--text-muted)]">Made by <a href="https://sayeedcodes.web.app" target="_blank" className="text-[var(--accent-color)] hover:text-[var(--accent-color-hover)] font-medium" rel="noopener noreferrer">Sayeed Ajmal</a></p>
          </div>
        </div>
      </div>
    </div >
  );

  const renderDocumentViewer = () => (
    <div className={`h-full flex flex-col bg-[var(--bg-secondary)]`}>
      {!activeDocument && (
        <div className="p-8 text-center text-[var(--text-muted)]">
          <span className="material-symbols-rounded text-4xl mb-4">description</span>
          <p>Select a document to view</p>
        </div>
      )}
      <div className={`flex-1 overflow-y-auto no-scrollbar flex justify-center p-4 bg-[var(--bg-primary)] relative`}>
        {/* Mobile Close Button for PDF */}
        {!isDesktop && activeDocument && (
          <button
            onClick={() => onViewDocument(null)}
            className="absolute top-4 right-4 z-50 p-2 bg-black/60 text-white rounded-full backdrop-blur-sm shadow-lg border border-white/20 hover:bg-black/80 transition-all"
            aria-label="Close PDF"
          >
            <span className="material-symbols-rounded text-xl block">close</span>
          </button>
        )}

        {activeDocument ? (
          <div ref={pdfWrapperRef} className="w-full max-w-4xl pt-8 md:pt-0"> {/* Add top padding on mobile for close button space if needed, or overlay it */}
            <Document
              file={`${API_URL}/files/${activeDocument.name || activeDocument.filename}`}
              onLoadSuccess={onDocumentLoadSuccess}
              loading={<div className="text-[var(--text-muted)] mt-10 text-center">Loading PDF...</div>}
              error={<div className="text-red-400 mt-10 text-center">Failed to load PDF.</div>}
              className="max-w-full"
            >
              {Array.from(new Array(numPages), (el, index) => {
                const pageNum = index + 1;
                // Check if this page has any highlights/citations
                const pageHighlights = currentHighlights.filter(h => h.page === pageNum);
                const hasHighlight = pageHighlights.length > 0;

                return (
                  <div key={`page_${pageNum}`} id={`page_${pageNum}`} className="mb-4 shadow-lg relative">
                    {/* Citation Badge */}
                    {hasHighlight && (
                      <div className="absolute top-2 right-2 z-10 bg-[var(--accent-color)] text-white px-3 py-1 rounded-lg text-xs font-bold shadow-md animate-pulse">
                        Cited
                      </div>
                    )}
                    <Page
                      pageNumber={pageNum}
                      width={pdfWidth || (isDesktop ? 600 : window.innerWidth - 32)} // Fallback width for mobile
                      renderTextLayer={false}
                      renderAnnotationLayer={false}
                      className=""
                    />
                  </div>
                );
              })}
            </Document>
          </div>
        ) : (
          <div className="flex items-center justify-center text-[var(--text-muted)] h-full">No active document</div>
        )}
      </div>
    </div >
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