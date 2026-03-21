import React, { useState } from "react";
import PropTypes from "prop-types";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { motion, AnimatePresence } from "framer-motion";
import ToolApprovalCard from "./ToolApprovalCard";

const ThinkingBlock = ({ content, isThinking }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="mb-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] overflow-hidden max-w-2xl">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)] transition-colors"
      >
        <span className={`material-symbols-rounded text-[16px] transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
          keyboard_arrow_down
        </span>
        <span className="flex-1 text-left flex items-center gap-2">
          {isThinking ? (
            <>
              <span className="inline-block w-2 h-2 rounded-full bg-[var(--accent-color)] animate-pulse" />
              Thinking Process...
            </>
          ) : (
            "Thinking Process"
          )}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
          >
            <div className="px-4 pb-3 pt-0 overflow-x-auto max-h-[40vh] overflow-y-auto custom-scrollbar">
              <pre className="text-xs font-mono text-[var(--text-secondary)] whitespace-pre-wrap leading-relaxed opacity-90">
                {content}
              </pre>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const RecSec = ({ message, onCitationClick }) => {
  const [copiedBlocks, setCopiedBlocks] = useState({});

  // Parse message for <think> blocks
  let thinkingContent = null;
  let mainContent = message.gpt_response || "";
  let isThinking = false;

  const thinkStart = mainContent.indexOf("<think>");
  if (thinkStart !== -1) {
    const thinkEnd = mainContent.indexOf("</think>");

    if (thinkEnd !== -1) {
      // Completed think block
      thinkingContent = mainContent.substring(thinkStart + 7, thinkEnd);
      mainContent = mainContent.substring(0, thinkStart) + mainContent.substring(thinkEnd + 8);
    } else {
      // Still thinking (streaming)
      thinkingContent = mainContent.substring(thinkStart + 7);
      mainContent = ""; // Hide main content while thinking (or show partial if text before <think>)
      isThinking = true;
    }
  }

  return (
    <div className="flex gap-4 mb-8 w-full md:max-w-4xl mx-auto px-1 md:px-0 message-enter">
      {/* Avatar */}
      <div className="flex-shrink-0 flex flex-col items-center">
        <div className="w-8 h-8 rounded-md bg-gradient-to-br from-[var(--accent-color)] to-[var(--accent-color-hover)] flex items-center justify-center p-1 shadow-md">
          <img
            src="/PersonalGPT.png"
            alt="Bot"
            className="w-full h-full object-cover rounded-sm mix-blend-multiply"
            onError={(e) => {
              e.target.style.display = "none";
              e.target.parentElement.textContent = "AI";
            }}
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 overflow-hidden">
        {/* Tool Approval Cards */}
        {message.tool_calls?.length > 0 && (
          <div className="mb-4 space-y-3">
            {message.tool_calls.map((toolCall, index) => (
              <ToolApprovalCard
                key={index}
                toolName={toolCall.tool_name || toolCall.tool}
                description={toolCall.description || ""}
                serverName={toolCall.server}
                arguments={toolCall.arguments}
                result={toolCall.result}
                status={toolCall.status || "approved"}
                approvalId={`tool-call-${index}`}
              />
            ))}
          </div>
        )}

        {/* Thinking Block */}
        {thinkingContent && (
          <ThinkingBlock content={thinkingContent} isThinking={isThinking} />
        )}

        {/* Markdown Content */}
        <div className="prose dark:prose-invert max-w-none p-0 m-0
          prose-headings:font-semibold prose-headings:text-[var(--text-primary)] prose-headings:my-2
          prose-p:text-[var(--text-primary)] prose-p:leading-snug prose-p:my-1
          prose-strong:text-[var(--accent-color)] prose-strong:font-semibold
          prose-ul:text-[var(--text-primary)] prose-ul:my-2 prose-ul:leading-snug
          prose-ol:text-[var(--text-primary)] prose-ol:my-2 prose-ol:leading-snug
          prose-li:text-[var(--text-primary)] prose-li:marker:text-[var(--accent-color)] prose-li:my-0.5
          prose-table:border-[var(--border-medium)] prose-table:my-3
          prose-th:border-[var(--border-medium)] prose-th:px-3 prose-th:py-2 prose-th:bg-[var(--bg-input)]
          prose-td:border-[var(--border-subtle)] prose-td:px-3 prose-td:py-2
          prose-code:text-[var(--accent-color)] prose-code:font-medium prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded
          prose-blockquote:border-l-[var(--accent-color)] prose-blockquote:text-[var(--text-secondary)] prose-blockquote:my-2 prose-blockquote:not-italic
        ">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              code({ inline, className, children }) {
                const match = /language-(\w+)/.exec(className || "");
                const code = String(children).replace(/\n$/, "");
                const blockId = `${match?.[1] || 'text'}-${code.substring(0, 20)}`; // Unique ID per block

                if (inline) {
                  return (
                    <code className="px-1.5 py-0.5 rounded text-sm" style={{ backgroundColor: 'var(--code-inline-bg)', color: 'var(--code-text)' }}>
                      {children}
                    </code>
                  );
                }

                return (
                  <div className="my-4 rounded-xl overflow-hidden" style={{ borderColor: 'var(--border-medium)', backgroundColor: 'var(--code-bg)' }}>
                    <div className="flex justify-between items-center px-4 py-2 text-xs" style={{ backgroundColor: 'var(--code-header)', color: 'var(--text-secondary)' }}>
                      <span>{match?.[1] || "text"}</span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(code);
                          setCopiedBlocks(prev => ({ ...prev, [blockId]: true }));
                          setTimeout(() => {
                            setCopiedBlocks(prev => ({ ...prev, [blockId]: false }));
                          }, 2000);
                        }}
                        className="flex items-center gap-1.5 hover:text-[var(--accent-color-hover)] transition"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        <span className="material-symbols-rounded text-[14px]">
                          {copiedBlocks[blockId] ? 'check' : 'content_copy'}
                        </span>
                        {copiedBlocks[blockId] ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                    <SyntaxHighlighter
                      language={match?.[1] || "text"}
                      style={vscDarkPlus}
                      customStyle={{
                        margin: 0,
                        padding: "0.5rem",
                        backgroundColor: 'var(--code-bg)',
                        color: 'var(--code-text)'
                      }}
                      showLineNumbers
                      wrapLines
                      lineNumberStyle={{ color: 'var(--text-muted)' }}
                      codeTagProps={{ style: { color: 'var(--code-text)' } }}
                    >
                      {code}
                    </SyntaxHighlighter>
                  </div>
                );
              },
            }}
          >
            {mainContent}
          </ReactMarkdown>
        </div>

        {/* Citations */}
        {message.highlighted_contexts?.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2 pt-2 border-t border-[var(--border-subtle)]">
            {message.highlighted_contexts.map((context, index) => (
              <button
                key={index}
                onClick={() => onCitationClick?.(context)}
                className="flex items-center gap-1.5 px-3 py-1.5
                  bg-[var(--bg-input)]
                  border border-[var(--border-medium)]
                  rounded-lg text-xs text-[var(--text-secondary)]
                  hover:border-[var(--accent-color)]/30
                  hover:text-[var(--text-primary)]
                  transition-all"
              >
                <span className="material-symbols-rounded text-[14px] text-[var(--accent-color)]">
                  description
                </span>
                Pg {context.page}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

RecSec.propTypes = {
  message: PropTypes.object.isRequired,
  onCitationClick: PropTypes.func,
};

export default RecSec;
