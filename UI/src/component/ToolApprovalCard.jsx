import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// --- Helper Components ---

const JsonPrimitive = ({ value }) => {
    if (value === null) return <span className="text-[var(--text-muted)] opacity-40 italic text-[10px] uppercase tracking-tighter">null</span>;
    if (value === undefined) return <span className="text-[var(--text-muted)] opacity-40 italic text-[10px] uppercase tracking-tighter">undefined</span>;
    if (typeof value === 'boolean') return <span className="text-amber-500 font-black">{value.toString()}</span>;
    if (typeof value === 'number') return <span className="text-amber-400 font-mono font-bold leading-none">{value}</span>;
    if (typeof value === 'string') {
        const displayValue = value.length > 120 ? `${value.substring(0, 120)}...` : value;
        return <span className="text-emerald-400/80 break-all leading-relaxed tracking-tight">"{displayValue}"</span>;
    }
    return <span className="text-[var(--text-secondary)] opacity-70">{String(value)}</span>;
};

const JsonNode = ({ name, value, depth = 0, isLast = true }) => {
    const [isExpanded, setIsExpanded] = useState(depth < 1);

    if (value === null || typeof value !== 'object') {
        return (
            <div className="font-mono text-[11px] leading-relaxed hover:bg-[var(--bg-surface-subtle)] px-2 py-1 rounded-lg group transition-colors select-text">
                {name && <span className="text-[var(--text-muted)] opacity-60 font-bold group-hover:text-[var(--text-secondary)] transition-opacity mr-2">{name}:</span>}
                <JsonPrimitive value={value} />
                {!isLast && <span className="text-[var(--text-muted)] opacity-30 ml-0.5">,</span>}
            </div>
        );
    }

    const isArray = Array.isArray(value);
    const keys = Object.keys(value);
    const isEmpty = keys.length === 0;
    const preview = isArray ? `Array[${keys.length}]` : `Object{${keys.length}}`;

    if (isEmpty) {
        return (
            <div className="font-mono text-[11px] leading-relaxed px-2 py-1 opacity-40">
                {name && <span className="text-[var(--text-muted)] opacity-60 mr-2">{name}:</span>}
                <span className="text-[var(--text-muted)] opacity-50">{isArray ? '[]' : '{}'}</span>
                {!isLast && <span className="text-[var(--text-muted)] opacity-30">,</span>}
            </div>
        );
    }

    return (
        <div className="font-mono text-[11px] leading-relaxed">
            <div
                className="flex items-center gap-2 cursor-pointer hover:bg-[var(--bg-surface-subtle)] py-1 px-2 rounded-xl select-none group transition-all"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <span className={`material-symbols-rounded !text-[14px] text-amber-500/40 group-hover:text-amber-500 transition-all ${isExpanded ? 'rotate-90' : ''}`}>chevron_right</span>
                {name && <span className="text-[var(--text-muted)] font-black group-hover:text-[var(--text-primary)] transition-colors uppercase tracking-widest text-[9px]">{name}</span>}
                {!isExpanded && <span className="text-amber-500/30 italic text-[9px] font-bold group-hover:opacity-100 uppercase tracking-tighter ml-auto">{preview}</span>}
            </div>

            <AnimatePresence>
                {isExpanded && (
                    <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                        className="pl-4 border-l border-[var(--border-subtle)] ml-3.5 my-1.5"
                    >
                        {keys.map((key, index) => (
                            <JsonNode
                                key={key}
                                name={isArray ? null : key}
                                value={value[key]}
                                depth={depth + 1}
                                isLast={index === keys.length - 1}
                            />
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
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
    status = 'pending' // pending | executing | approved | denied | timeout | error
}) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [finalArgs, setFinalArgs] = useState(toolArgs);
    const [finalResult, setFinalResult] = useState(result);

    useEffect(() => {
        const isTerminalStatus = ['approved', 'denied', 'error', 'timeout'].includes(status);
        if (isTerminalStatus && finalResult == null) {
            setFinalArgs(toolArgs);
            setFinalResult(result);
            if (status === 'approved') setIsExpanded(true);
        }
    }, [status, result, toolArgs, finalResult]);

    const handleCopy = (text) => {
        const val = typeof text === 'object' ? JSON.stringify(text, null, 2) : text;
        navigator.clipboard.writeText(val);
    };

    const displayServerName = serverName && serverName.toLowerCase() !== 'unknown' ? serverName : 'Node Engine';

    // --- PENDING STATE ---
    if (status === 'pending') {
        return (
            <motion.div
                layout
                initial={{ opacity: 0, y: 15, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className="mb-8 glass border border-amber-500/30 rounded-[2rem] w-full md:max-w-[420px] shadow-2xl overflow-hidden bg-amber-500/[0.02]"
            >
                <div className="p-7">
                    {/* Header */}
                    <div className="flex items-center gap-5 mb-6">
                        <div className="size-14 rounded-2xl bg-amber-500 flex items-center justify-center text-black shadow-xl shadow-amber-500/20 border border-white/20">
                             <span className="material-symbols-rounded !text-2xl font-bold">account_balance_wallet</span>
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                                <span className="text-[10px] font-black text-amber-500 uppercase tracking-[0.25em]">{displayServerName}</span>
                                <span className="size-1 rounded-full bg-amber-500/40" />
                            </div>
                            <h4 className="font-display font-black text-[var(--text-primary)] truncate text-lg tracking-tight italic uppercase">{toolName}</h4>
                        </div>
                    </div>

                    <p className="text-[11px] text-[var(--text-muted)] font-medium mb-6 leading-relaxed italic bg-[var(--bg-surface-subtle)] p-4 rounded-xl border border-[var(--border-subtle)]">
                        <span className="text-amber-500 font-black mr-2 uppercase tracking-widest text-[9px]">Instruction:</span>
                        {description || `System requests authorization to initiate ${toolName} procedure.`}
                    </p>

                    {/* Arguments Preview */}
                    <div className="bg-[var(--bg-surface-subtle)] rounded-2xl p-5 border border-[var(--border-subtle)] mb-6 overflow-x-auto max-h-[300px] custom-scrollbar">
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-[9px] font-black text-[var(--text-primary)] uppercase tracking-[0.3em]">Payload Matrix</span>
                            <div className="size-1.5 rounded-full bg-amber-500 animate-pulse" />
                        </div>
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
                            className="flex-1 px-4 py-3.5 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] bg-[var(--bg-surface-subtle)] hover:bg-red-500/10 text-[var(--text-muted)] hover:text-red-400 transition-all border border-[var(--border-subtle)] hover:border-red-500/30 active:scale-[0.98]"
                        >
                            Abort
                        </button>
                        <button
                            onClick={onApprove}
                            className="flex-2 px-8 py-3.5 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] bg-[var(--text-primary)] text-[var(--bg-primary)] hover:bg-amber-500 transition-all shadow-xl active:scale-[0.98]"
                        >
                            Authorize
                        </button>
                    </div>
                </div>
            </motion.div>
        );
    }

    // --- EXECUTING STATE ---
    if (status === 'executing') {
        return (
            <motion.div 
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="mb-8 px-8 py-5 w-fit rounded-[1.5rem] border border-amber-500/30 bg-amber-500/5 backdrop-blur-xl flex items-center gap-5 shadow-2xl"
            >
                <div className="relative size-8 flex items-center justify-center">
                    <div className="absolute inset-0 rounded-full border-4 border-amber-500/10" />
                    <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-amber-500 animate-spin" />
                </div>
                <div className="flex flex-col">
                    <span className="text-[10px] font-black text-amber-500 uppercase tracking-[0.3em]">Executing Protocol</span>
                    <span className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-widest mt-0.5">{toolName}</span>
                </div>
            </motion.div>
        );
    }

    // --- DENIED STATE ---
    if (status === 'denied') {
        return (
            <motion.div 
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="mb-8 bg-red-500/5 backdrop-blur-xl border border-red-500/20 rounded-[1.5rem] p-6 flex items-start gap-5 shadow-2xl"
            >
                <div className="size-12 rounded-2xl bg-red-500/10 flex items-center justify-center text-red-500 border border-red-500/20">
                    <span className="material-symbols-rounded !text-2xl font-bold">cancel</span>
                </div>
                <div className="flex flex-col gap-1.5">
                    <span className="font-display font-black text-red-400 text-sm uppercase tracking-wider italic">Access Revoked</span>
                    <p className="text-xs text-[var(--text-muted)] leading-relaxed font-medium">
                        Manual override initiated. Procedure <span className="text-[var(--text-primary)] font-bold">{toolName}</span> terminated.
                    </p>
                </div>
            </motion.div>
        );
    }

    // --- TERMINAL/COMPLETED STATE ---
    return (
        <div className="mb-8">
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="group flex items-center gap-4 px-5 py-2 rounded-2xl hover:bg-[var(--bg-surface-subtle)] transition-all text-left w-full max-w-[420px]"
            >
                <div className={`size-8 rounded-xl flex items-center justify-center border transition-all ${
                    status === 'error' 
                    ? 'bg-red-500/10 border-red-500/20 text-red-500' 
                    : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500'
                }`}>
                    <span className="material-symbols-rounded !text-base font-bold">
                        {status === 'error' ? 'report' : 'verified_user'}
                    </span>
                </div>
                
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[9px] font-black text-[var(--text-muted)] uppercase tracking-[0.2em] opacity-50">{displayServerName}</span>
                        <span className="size-1 rounded-full bg-[var(--border-subtle)]" />
                        <span className="text-[9px] font-black text-[var(--text-muted)] uppercase tracking-[0.1em] font-mono">{toolName}</span>
                    </div>
                    <div className={`text-[11px] font-bold uppercase tracking-widest ${status === 'error' ? 'text-red-400/80' : 'text-emerald-500/60'}`}>
                        {status === 'error' ? 'Protocol Breach' : 'Verification Success'}
                    </div>
                </div>

                <div className={`size-8 rounded-full border border-[var(--border-subtle)] flex items-center justify-center transition-transform duration-500 ${isExpanded ? 'rotate-180 bg-[var(--bg-surface-subtle)]' : 'group-hover:scale-110'}`}>
                    <span className="material-symbols-rounded text-[var(--text-muted)] !text-base">expand_more</span>
                </div>
            </button>

            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                        className="overflow-hidden"
                    >
                        <div className="mt-4 glass border border-[var(--border-subtle)] rounded-[2rem] shadow-sm overflow-hidden w-full md:max-w-[420px] bg-[var(--bg-glass)]">
                            {/* Header */}
                            <div className="px-7 py-5 bg-[var(--bg-surface-subtle)] border-b border-[var(--border-subtle)] flex items-center justify-between">
                                <div className="flex flex-col">
                                    <span className="text-[9px] font-black text-amber-500 uppercase tracking-[0.3em]">Session Archive</span>
                                    <span className="text-xs font-black text-[var(--text-primary)] uppercase tracking-wider italic">{toolName}</span>
                                </div>
                                <span className="px-3 py-1 bg-[var(--bg-surface-subtle)] border border-[var(--border-subtle)] rounded-full text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest">
                                    {approvalId || 'TRX-829'}
                                </span>
                            </div>

                            <div className="p-7 space-y-8">
                                {/* INPUT BLOCK */}
                                <div>
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="flex items-center gap-2">
                                            <div className="size-1.5 rounded-full bg-amber-500" />
                                            <span className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-[0.2em]">Input Vectors</span>
                                        </div>
                                        <button
                                            onClick={() => handleCopy(finalArgs)}
                                            className="size-7 rounded-lg bg-[var(--bg-surface-subtle)] hover:bg-amber-500 hover:text-black text-[var(--text-muted)] transition-all flex items-center justify-center"
                                        >
                                            <span className="material-symbols-rounded !text-sm">content_copy</span>
                                        </button>
                                    </div>
                                    <div className="bg-[var(--bg-surface-subtle)] rounded-2xl p-5 border border-[var(--border-subtle)] overflow-x-auto custom-scrollbar">
                                        {Object.keys(finalArgs || {}).length > 0 ? (
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
                                            <span className="text-[11px] font-mono text-[var(--text-muted)] italic tracking-tight opacity-50">Void Arguments</span>
                                        )}
                                    </div>
                                </div>

                                {/* OUTPUT/ERROR BLOCK */}
                                <div>
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="flex items-center gap-2">
                                            <div className={`size-1.5 rounded-full ${status === 'error' ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'}`} />
                                            <span className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-[0.2em]">
                                                {status === 'error' ? 'Exception Log' : 'Return Stream'}
                                            </span>
                                        </div>
                                        <button
                                            onClick={() => handleCopy(finalResult || {})}
                                            className="size-7 rounded-lg bg-[var(--bg-surface-subtle)] hover:bg-amber-500 hover:text-black text-[var(--text-muted)] transition-all flex items-center justify-center"
                                        >
                                            <span className="material-symbols-rounded !text-sm">content_copy</span>
                                        </button>
                                    </div>
                                    <div className={`rounded-2xl p-5 border overflow-x-auto custom-scrollbar min-h-[60px] ${
                                        status === 'error' ? 'bg-red-500/5 border-red-500/20' : 'bg-[var(--bg-surface-subtle)] border-[var(--border-subtle)]'
                                    }`}>
                                        {finalResult !== undefined && finalResult !== null ? (
                                            typeof finalResult === 'object' ? (
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
                                                <div className={`font-mono text-[11px] leading-relaxed tracking-tight ${status === 'error' ? 'text-red-400' : 'text-emerald-400/80'}`}>
                                                    <JsonPrimitive value={finalResult} />
                                                </div>
                                            )
                                        ) : (
                                            <span className="text-[11px] font-mono text-[var(--text-muted)] italic tracking-tight opacity-50">Protocol finalized with null return</span>
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
};

export default ToolApprovalCard;
