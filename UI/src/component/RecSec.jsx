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
    <div className="mb-6 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)] overflow-hidden max-w-2xl backdrop-blur-md">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-[11px] font-bold text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-surface-subtle)] transition-all uppercase tracking-wider"
      >
        <span className={`material-symbols-rounded !text-base transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>
          expand_more
        </span>
        <span className="flex-1 text-left flex items-center gap-2">
          {isThinking ? (
            <>
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              Processing...
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
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="px-5 pb-4 pt-1 overflow-x-auto max-h-[40vh] overflow-y-auto no-scrollbar">
              <pre className="text-xs font-mono text-[var(--text-secondary)] whitespace-pre-wrap leading-relaxed opacity-80">
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
      thinkingContent = mainContent.substring(thinkStart + 7, thinkEnd);
      mainContent = mainContent.substring(0, thinkStart) + mainContent.substring(thinkEnd + 8);
    } else {
      thinkingContent = mainContent.substring(thinkStart + 7);
      mainContent = "";
      isThinking = true;
    }
  }

  return (
    <div className="flex gap-4 mb-10 w-full md:max-w-4xl mx-auto px-2 md:px-0 message-reveal items-start">
      {/* Avatar */}
      <div className="flex-shrink-0 mt-1">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center shadow-lg shadow-amber-900/20 border border-amber-400/20">
             <span className="material-symbols-rounded text-white !text-xl">payments</span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Tool Approval Cards */}
        {message.tool_calls?.length > 0 && (
          <div className="mb-6 space-y-4">
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
          prose-headings:font-display prose-headings:font-bold prose-headings:text-[var(--text-primary)] prose-headings:tracking-tight prose-headings:mb-4
          prose-p:text-[var(--text-primary)] prose-p:leading-relaxed prose-p:mb-5 prose-p:font-light
          prose-strong:text-amber-500 prose-strong:font-bold
          prose-ul:text-[var(--text-primary)] prose-ul:mb-5 prose-ul:space-y-2
          prose-ol:text-[var(--text-primary)] prose-ol:mb-5 prose-ol:space-y-2
          prose-li:text-[var(--text-primary)] prose-li:marker:text-amber-500
          prose-table:border-collapse prose-table:border border-[var(--border-subtle)] prose-table:my-6 prose-table:rounded-xl prose-table:overflow-hidden
          prose-th:px-4 prose-th:py-3 prose-th:bg-[var(--bg-surface-subtle)] prose-th:text-[var(--text-secondary)] prose-th:font-bold prose-th:text-xs prose-th:uppercase prose-th:tracking-wider
          prose-td:px-4 prose-td:py-3 prose-td:border-t border-[var(--border-subtle)] prose-td:text-sm
          prose-code:text-emerald-400 prose-code:bg-emerald-500/10 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-lg prose-code:font-mono prose-code:before:content-none prose-code:after:content-none
          prose-blockquote:border-l-4 prose-blockquote:border-amber-500/50 prose-blockquote:bg-[var(--bg-surface-subtle)] prose-blockquote:px-6 prose-blockquote:py-1 prose-blockquote:rounded-r-xl prose-blockquote:italic prose-blockquote:text-[var(--text-secondary)]
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
                  <div className="my-6 rounded-2xl overflow-hidden border border-[var(--border-subtle)] shadow-2xl shadow-black/40" style={{ backgroundColor: 'var(--code-bg)' }}>
                    <div className="flex justify-between items-center px-5 py-2.5 text-[10px] font-bold uppercase tracking-wider" style={{ backgroundColor: 'var(--code-header)', color: 'var(--text-muted)' }}>
                      <span>{match?.[1] || "txt"}</span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(code);
                          setCopiedBlocks(prev => ({ ...prev, [blockId]: true }));
                          setTimeout(() => {
                            setCopiedBlocks(prev => ({ ...prev, [blockId]: false }));
                          }, 2000);
                        }}
                        className="flex items-center gap-1.5 hover:text-amber-500 transition-colors"
                      >
                        <span className="material-symbols-rounded !text-sm">
                          {copiedBlocks[blockId] ? 'check' : 'content_copy'}
                        </span>
                        {copiedBlocks[blockId] ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    <SyntaxHighlighter
                      language={match?.[1] || "text"}
                      style={vscDarkPlus}
                      customStyle={{
                        margin: 0,
                        padding: "1.25rem",
                        backgroundColor: 'transparent',
                        fontSize: '13px',
                        lineHeight: '1.6'
                      }}
                      showLineNumbers
                      lineNumberStyle={{ color: 'var(--text-muted)', minWidth: '2.5em', opacity: 0.5 }}
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
          <div className="mt-6 flex flex-wrap gap-2 pt-4 border-t border-[var(--border-subtle)]">
            {message.highlighted_contexts.map((context, index) => (
              <button
                key={index}
                onClick={() => onCitationClick?.(context)}
                className="flex items-center gap-2 px-3 py-2 bg-[var(--bg-surface-subtle)] border border-[var(--border-subtle)] rounded-xl text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] hover:bg-[var(--bg-glass)] hover:border-amber-500/30 hover:text-amber-500 transition-all shadow-sm"
              >
                <span className="material-symbols-rounded !text-sm text-amber-500">auto_stories</span>
                Page {context.page}
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
