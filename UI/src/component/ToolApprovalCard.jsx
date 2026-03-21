import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';


// --- Helper Components ---

const JsonPrimitive = ({ value }) => {
    if (value === null) return <span className="text-[var(--text-muted)]">null</span>;
    if (value === undefined) return <span className="text-[var(--text-muted)]">undefined</span>;
    if (typeof value === 'boolean') return <span className="text-purple-500 font-bold">{value.toString()}</span>;
    if (typeof value === 'number') return <span className="text-blue-500">{value}</span>;
    if (typeof value === 'string') {
        if (value.length > 100) {
            return <span className="text-red-600 dark:text-red-400">"{value.substring(0, 100)}..."</span>;
        }
        return <span className="text-red-600 dark:text-red-400">"{value}"</span>;
    }
    return <span>{String(value)}</span>;
};

const JsonNode = ({ name, value, depth = 0, isLast = true }) => {
    const [isExpanded, setIsExpanded] = useState(depth < 1);

    if (value === null || typeof value !== 'object') {
        return (
            <div className="font-mono text-xs leading-relaxed hover:bg-[var(--bg-input)] px-1 rounded cursor-default">
                {name && <span className="text-purple-600 dark:text-purple-400 mr-1">{name}:</span>}
                <JsonPrimitive value={value} />
                {!isLast && <span className="text-[var(--text-muted)]">,</span>}
            </div>
        );
    }

    const isArray = Array.isArray(value);
    const keys = Object.keys(value);
    const isEmpty = keys.length === 0;
    const preview = isArray ? `Array(${keys.length})` : `{...}`;

    if (isEmpty) {
        return (
            <div className="font-mono text-xs leading-relaxed px-1">
                {name && <span className="text-purple-600 dark:text-purple-400 mr-1">{name}:</span>}
                <span className="text-[var(--text-secondary)]">{isArray ? '[]' : '{}'}</span>
                {!isLast && <span className="text-[var(--text-muted)]">,</span>}
            </div>
        );
    }

    return (
        <div className="font-mono text-xs leading-relaxed">
            <div
                className="flex items-center gap-1 cursor-pointer hover:bg-[var(--bg-input)] px-1 rounded select-none"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <span className={`material-symbols-rounded text-[10px] text-[var(--text-muted)] transition-transform ${isExpanded ? 'rotate-90' : ''}`}>arrow_forward_ios</span>
                {name && <span className="text-purple-600 dark:text-purple-400 font-semibold">{name}:</span>}
                <span className="text-[var(--text-secondary)] italic ml-1">{preview}</span>
                {!isExpanded && !isLast && <span className="text-[var(--text-muted)]">,</span>}
            </div>

            {isExpanded && (
                <div className="pl-4 border-l border-[var(--border-medium)] ml-1">
                    {keys.map((key, index) => (
                        <JsonNode
                            key={key}
                            name={isArray ? null : key}
                            value={value[key]}
                            depth={depth + 1}
                            isLast={index === keys.length - 1}
                        />
                    ))}
                    <div className="text-[var(--text-muted)]">{isArray ? ']' : '}'}{!isLast && ','}</div>
                </div>
            )}
        </div>
    );
};

const ToolApprovalCard = ({
    toolName,
    description,
    serverName,
    arguments: toolArgs,
    result,
    approvalId,
    onApprove,
    onDeny,
    status = 'pending' // pending | executing | approved | denied | timeout
}) => {
    // --- STATE MANAGEMENT ---
    const [isExpanded, setIsExpanded] = useState(false);

    // Freeze data on completion
    const [finalArgs, setFinalArgs] = useState(toolArgs);
    const [finalResult, setFinalResult] = useState(result);

    useEffect(() => {
        // Strict state freezing on transition to terminal states
        // Terminal states: approved, denied, error, timeout
        // Only trigger ONCE when status changes to terminal state
        const isTerminalStatus = ['approved', 'denied', 'error', 'timeout'].includes(status);

        if (isTerminalStatus && finalResult == null) { // Check for both undefined and null
            // Freeze arguments and result for terminal states
            setFinalArgs(toolArgs);
            setFinalResult(result);

            // Auto-expand on approved status, even if result is null
            if (status === 'approved') {
                setIsExpanded(true);
            }
        }
    }, [status, result, toolArgs, finalResult]);

    const handleCopy = (text) => {
        const val = typeof text === 'object' ? JSON.stringify(text, null, 2) : text;
        navigator.clipboard.writeText(val);
    };

    // Handle server name with fallback
    const displayServerName = serverName && serverName.toLowerCase() !== 'unknown' ? serverName : 'MCP Server';
    const serverInitial = displayServerName ? displayServerName[0].toUpperCase() : 'M';
    const bgColors = ['bg-pink-500', 'bg-blue-500', 'bg-purple-500', 'bg-amber-500', 'bg-indigo-500'];
    const serverColor = bgColors[displayServerName.length % bgColors.length];

    // --- PHASE 1: PROPOSED (Pending Approval) ---
    // Strict Condition: Only show "Proposal Card" when pending.
    // Executing is treated as a locked state of this card in some designs, 
    // but user requested Executing be simple spinner.
    if (status === 'pending') {
        return (
            <motion.div
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-4 bg-[var(--bg-secondary)] rounded-2xl w-full md:max-w-[30vw] border border-[var(--border-medium)] shadow-sm overflow-hidden"
            >
                <div className="p-4">
                    {/* Header */}
                    <div className="flex items-center gap-3 mb-3">
                        <div className={`size-10 rounded-lg ${serverColor} flex items-center justify-center text-white font-bold text-lg shadow-sm`}>
                            {serverInitial}
                        </div>
                        <div>
                            <div className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">{displayServerName}</div>
                            <div className="font-semibold text-[var(--text-primary)]">{toolName}</div>
                        </div>
                    </div>

                    {/* Arguments Preview */}
                    <div className="bg-[var(--bg-input)] rounded-lg p-3 border border-[var(--border-medium)] mb-4 overflow-x-auto max-h-[200px] custom-scrollbar">
                        <div className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2">Arguments</div>
                        {typeof toolArgs === 'object' && toolArgs !== null ? (
                            Object.entries(toolArgs).map(([key, val], i) => (
                                <JsonNode
                                    key={key}
                                    name={key}
                                    value={val}
                                    depth={0}
                                    isLast={i === Object.keys(toolArgs).length - 1}
                                />
                            ))
                        ) : (
                            <div className="font-mono text-xs">
                                <JsonPrimitive value={toolArgs} />
                            </div>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3">
                        <button
                            onClick={onDeny}
                            className="flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold bg-[var(--bg-secondary)] hover:bg-[var(--bg-input)] text-[var(--text-primary)] transition-colors border border-[var(--border-medium)]"
                        >
                            Deny
                        </button>
                        <button
                            onClick={onApprove}
                            className="flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold bg-[var(--accent-color)] hover:bg-[var(--accent-color-hover)] text-white transition-colors shadow-sm"
                        >
                            Allow
                        </button>
                    </div>
                </div>
            </motion.div>
        );
    }

    // --- PHASE 2: EXECUTING (Locked UI) ---
    if (status === 'executing') {
        return (
            <div className="mb-4 p-4 w-fit rounded-xl border border-[var(--border-medium)] bg-[var(--bg-input)] flex flex-col items-center justify-center gap-2">
                <span className="material-symbols-rounded animate-spin text-[var(--accent-color)] text-xl">progress_activity</span>
                <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">Running Tool...</span>
            </div>
        );
    }

    // --- PHASE 2b: DENIED (Simple Banner) ---
    if (status === 'denied') {
        return (
            <div className="mb-4 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded-xl p-4 flex items-center gap-3">
                <span className="material-symbols-rounded text-red-500">block</span>
                <div className="flex flex-col">
                    <span className="font-semibold text-red-800 dark:text-red-300 text-sm">Action Denied</span>
                    <span className="text-xs text-red-600 dark:text-red-400">You cancelled the request to use {toolName}.</span>
                </div>
            </div>
        );
    }

    // --- PHASE 2c: TIMEOUT (Timeout Error State) ---
    if (status === 'timeout') {
        return (
            <div className="mb-4 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded-xl p-4 flex items-center gap-3">
                <span className="material-symbols-rounded text-red-500">schedule</span>
                <div className="flex flex-col">
                    <span className="font-semibold text-red-800 dark:text-red-300 text-sm">Action Timed Out</span>
                    <span className="text-xs text-red-600 dark:text-red-400">Request to use {toolName} timed out.</span>
                </div>
            </div>
        );
    }

    // --- PHASE 2d: ERROR (Generic Error State) - Expandable Accordion ---
    if (status === 'error') {
        return (
            <div className="mb-4">
                {/* Toggle Header */}
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="flex items-center gap-2 text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors mb-2 select-none group text-left"
                >
                    <div className="bg-[var(--bg-input)] px-1.5 py-0.5 rounded text-[10px] font-mono text-[var(--text-muted)] group-hover:text-[var(--text-secondary)] transition-colors">
                        Executed tool
                    </div>
                    <span className={`material-symbols-rounded text-lg transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>expand_more</span>

                    <span className="text-xs text-red-600 dark:text-red-500 font-medium ml-auto flex items-center gap-1">
                        <span className="material-symbols-rounded text-[14px]">error</span>
                        Failed
                    </span>
                </button>

                {/* Content */}
                <AnimatePresence>
                    {isExpanded && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                        >
                            <div className="border border-red-200 dark:border-red-900/30 bg-red-50 dark:bg-red-900/10 rounded-xl shadow-sm overflow-hidden w-full md:max-w-[30vw]">
                                {/* Tool Header */}
                                <div className="px-4 py-3 bg-red-100 dark:bg-red-900/20 border-b border-red-200 dark:border-red-900/30 flex items-center gap-3">
                                    <div className="size-8 rounded bg-red-200 dark:bg-red-900/30 flex items-center justify-center text-red-600 dark:text-red-400">
                                        <span className="material-symbols-rounded text-lg">error</span>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-[10px] font-bold text-red-600 dark:text-red-400 uppercase heading-font">{displayServerName}</span>
                                        <span className="text-sm font-bold text-red-800 dark:text-red-300 font-mono">{toolName}</span>
                                    </div>
                                </div>

                                <div className="p-4 space-y-6">
                                    {/* REQUEST BLOCK */}
                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">Request</span>
                                            <button
                                                onClick={() => handleCopy(finalArgs)}
                                                className="text-[10px] flex items-center gap-1 text-[var(--text-muted)] hover:text-[var(--accent-color)] transition-colors uppercase font-bold"
                                            >
                                                <span className="material-symbols-rounded text-[12px]">content_copy</span>
                                                Copy
                                            </button>
                                        </div>
                                        <div className="bg-[var(--bg-input)] rounded-lg p-3 border border-[var(--border-medium)] overflow-x-auto">
                                            {typeof finalArgs === 'object' && finalArgs !== null ? (
                                                Object.entries(finalArgs).map(([key, val], i) => (
                                                    <JsonNode
                                                        key={key}
                                                        name={key}
                                                        value={val}
                                                        depth={0}
                                                        isLast={i === Object.keys(finalArgs).length - 1}
                                                    />
                                                ))
                                            ) : (
                                                <div className="font-mono text-xs">
                                                    <JsonPrimitive value={finalArgs} />
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* ERROR DETAILS BLOCK */}
                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-[10px] font-bold text-red-600 dark:text-red-400 uppercase tracking-widest">Error Details</span>
                                            <button
                                                onClick={() => handleCopy(finalResult || result || {})}
                                                className="text-[10px] flex items-center gap-1 text-[var(--text-muted)] hover:text-[var(--accent-color)] transition-colors uppercase font-bold"
                                            >
                                                <span className="material-symbols-rounded text-[12px]">content_copy</span>
                                                Copy
                                            </button>
                                        </div>
                                        <div className="bg-[var(--bg-input)] rounded-lg p-3 border border-red-200 dark:border-red-800/30 overflow-x-auto min-h-[40px]">
                                            {(finalResult || result) ? (
                                                typeof (finalResult || result) === 'object' && (finalResult || result) !== null ? (
                                                    Object.entries(finalResult || result).map(([key, val], i) => (
                                                        <JsonNode
                                                            key={key}
                                                            name={key}
                                                            value={val}
                                                            depth={0}
                                                            isLast={i === Object.keys(finalResult || result).length - 1}
                                                        />
                                                    ))
                                                ) : (
                                                    <div className="font-mono text-xs text-red-600 dark:text-red-400">
                                                        <JsonPrimitive value={finalResult || result} />
                                                    </div>
                                                )
                                            ) : (
                                                <span className="font-mono text-xs text-red-400 italic">No error details available</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        );
    }


    // --- PHASE 3: COMPLETED / FROZEN (Accordion) ---

    // Standard Completed View
    return (
        <div className="mb-4">
            {/* Toggle Header */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex items-center gap-2 text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors mb-2 select-none group text-left"
            >
                <div className="bg-[var(--bg-input)] px-1.5 py-0.5 rounded text-[10px] font-mono text-[var(--text-muted)] group-hover:text-[var(--text-secondary)] transition-colors">
                    Executed tool
                </div>
                <span className={`material-symbols-rounded text-lg transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>expand_more</span>

                {status === 'error' ? (
                    <span className="text-xs text-red-600 dark:text-red-500 font-medium ml-auto flex items-center gap-1">
                        <span className="material-symbols-rounded text-[14px]">error</span>
                        Failed
                    </span>
                ) : (
                    <span className="text-xs text-green-600 dark:text-green-500 font-medium ml-auto flex items-center gap-1">
                        <span className="material-symbols-rounded text-[14px]">check_circle</span>
                        Success
                    </span>
                )}
            </button>

            {/* Content */}
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="border border-[var(--border-medium)] bg-[var(--bg-secondary)] rounded-xl shadow-sm overflow-hidden w-full md:max-w-[30vw]">
                            {/* Tool Header */}
                            <div className="px-4 py-3 bg-[var(--bg-input)] border-b border-[var(--border-medium)] flex items-center gap-3">
                                <div className="size-8 rounded bg-[var(--bg-primary)] flex items-center justify-center text-[var(--text-muted)]">
                                    <span className="material-symbols-rounded text-lg">extension</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase heading-font">{displayServerName}</span>
                                    <span className="text-sm font-bold text-[var(--text-primary)] font-mono">{toolName}</span>
                                </div>
                            </div>

                            <div className="p-4 space-y-6">
                                {/* REQUEST BLOCK (Always visible if expanding completed tool) */}
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">Request</span>
                                        <button
                                            onClick={() => handleCopy(finalArgs)}
                                            className="text-[10px] flex items-center gap-1 text-[var(--text-muted)] hover:text-[var(--accent-color)] transition-colors uppercase font-bold"
                                        >
                                            <span className="material-symbols-rounded text-[12px]">content_copy</span>
                                            Copy
                                        </button>
                                    </div>
                                    <div className="bg-[var(--bg-input)] rounded-lg p-3 border border-[var(--border-medium)] overflow-x-auto">
                                        {typeof finalArgs === 'object' && finalArgs !== null ? (
                                            Object.entries(finalArgs).map(([key, val], i) => (
                                                <JsonNode
                                                    key={key}
                                                    name={key}
                                                    value={val}
                                                    depth={0}
                                                    isLast={i === Object.keys(finalArgs).length - 1}
                                                />
                                            ))
                                        ) : (
                                            <div className="font-mono text-xs">
                                                <JsonPrimitive value={finalArgs} />
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* RESPONSE BLOCK (Visible for terminal states with results, excluding timeout which is handled separately) */}
                                {(status === 'approved' || status === 'error') && (
                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <span className={`text-[10px] font-bold ${status === 'error' ? 'text-red-500' : 'text-[var(--accent-color)]'} uppercase tracking-widest`}>
                                                {status === 'error' ? 'Error Message' : 'Response'}
                                            </span>
                                            <button
                                                onClick={() => handleCopy(finalResult || {})}
                                                className="text-[10px] flex items-center gap-1 text-[var(--text-muted)] hover:text-[var(--accent-color)] transition-colors uppercase font-bold"
                                            >
                                                <span className="material-symbols-rounded text-[12px]">content_copy</span>
                                                Copy
                                            </button>
                                        </div>
                                        <div className="bg-[var(--bg-input)] rounded-lg p-3 border border-[var(--border-medium)] overflow-x-auto min-h-[40px]">
                                            {finalResult !== undefined ? (
                                                typeof finalResult === 'object' && finalResult !== null ? (
                                                    Object.entries(finalResult).map(([key, val], i) => (
                                                        <JsonNode
                                                            key={key}
                                                            name={key}
                                                            value={val}
                                                            depth={0}
                                                            isLast={i === Object.keys(finalResult).length - 1}
                                                        />
                                                    ))
                                                ) : (
                                                    <div className="font-mono text-xs">
                                                        <JsonPrimitive value={finalResult} />
                                                    </div>
                                                )
                                            ) : (
                                                <span className="font-mono text-xs text-slate-400 italic">null</span>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </motion.div >
                )}
            </AnimatePresence >
        </div >
    );
};

export default ToolApprovalCard;
