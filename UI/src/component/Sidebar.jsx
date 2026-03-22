import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Darkmode from './Darkmode';

function Sidebar({ isOpen, onClose, isCollapsed, onToggleCollapse, onNewChat, historySessions, selectedSession, onSessionSelect, onDeleteSession, onOpenSettings }) {
    const [isDesktop, setIsDesktop] = useState(() => {
        if (typeof window !== "undefined") return window.innerWidth >= 768;
        return true;
    });

    useEffect(() => {
        if (typeof window === "undefined") return;
        const handleResize = () => setIsDesktop(window.innerWidth >= 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const handleNewChat = () => {
        onNewChat?.();
        if (!isDesktop) onClose?.();
    };

    return (
        <>
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
                        onClick={onClose}
                    />
                )}
            </AnimatePresence>

            <motion.aside
                className={`fixed md:relative z-50 flex flex-col h-full glass border-r border-white/5 text-[var(--text-primary)] p-4 shadow-2xl ${
                    isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
                }`}
                initial={false}
                animate={{
                    width: isCollapsed && isDesktop ? '88px' : '300px',
                    x: isOpen || isDesktop ? 0 : '-100%'
                }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            >
                {/* Header: Logo & Toggle */}
                <div className="flex items-center justify-between mb-10 px-2">
                    <AnimatePresence mode="wait">
                        {!isCollapsed && (
                            <motion.div 
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -10 }}
                                className="flex items-center gap-3"
                            >
                                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center shadow-xl shadow-amber-500/20 border border-amber-400/30">
                                    <span className="material-symbols-rounded text-white !text-xl font-bold">payments</span>
                                </div>
                                <span className="font-display font-black text-xl tracking-tighter italic uppercase text-[var(--text-primary)]">AiBank</span>
                            </motion.div>
                        )}
                    </AnimatePresence>
                    
                    <button
                        onClick={onToggleCollapse}
                        className={`p-2.5 hover:bg-[var(--bg-surface-subtle)] rounded-2xl transition-all group ${isCollapsed ? 'mx-auto' : ''}`}
                    >
                        <span className="material-symbols-rounded !text-base text-[var(--text-muted)] group-hover:text-amber-500 transition-colors">
                            {isCollapsed ? 'menu_open' : 'dock_to_left'}
                        </span>
                    </button>
                </div>

                {/* New Chat Button */}
                <div className="mb-10">
                    <button
                        onClick={handleNewChat}
                        className={`flex items-center gap-3 py-4 w-full bg-[var(--text-primary)] text-[var(--bg-primary)] rounded-[1.25rem] font-black uppercase tracking-[0.2em] text-[10px] shadow-2xl hover:bg-amber-500 hover:text-white transition-all group active:scale-[0.98] ${
                            isCollapsed ? 'justify-center px-0' : 'px-6'
                        }`}
                    >
                        <span className="material-symbols-rounded !text-lg group-hover:rotate-90 transition-transform duration-500">add</span>
                        {!isCollapsed && <span>New Session</span>}
                    </button>
                </div>

                {/* History List */}
                <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 -mx-2 px-2">
                    {!isCollapsed && (
                        <div className="text-[9px] font-black text-[var(--text-muted)] opacity-50 px-4 mb-4 uppercase tracking-[0.3em]">Temporal Archive</div>
                    )}
                    
                    {historySessions.length > 0 ? (
                        historySessions.map((session) => (
                            <motion.div
                                layout
                                key={session.id}
                                className={`group relative flex items-center gap-4 py-3.5 rounded-2xl cursor-pointer transition-all duration-500 border ${
                                    selectedSession === session.id
                                        ? 'bg-amber-500/10 border-amber-500/20 shadow-lg'
                                        : 'hover:bg-[var(--bg-surface-subtle)] border-transparent hover:border-[var(--border-subtle)]'
                                } ${isCollapsed ? 'justify-center px-0' : 'px-4'}`}
                                onClick={() => {
                                    onSessionSelect?.(session.id);
                                    if (!isDesktop) onClose();
                                }}
                            >
                                <div className={`flex-shrink-0 transition-all duration-500 ${selectedSession === session.id ? 'scale-110' : 'group-hover:opacity-100 opacity-40'}`}>
                                    <span className={`material-symbols-rounded !text-lg ${
                                        selectedSession === session.id ? 'text-amber-500 font-bold' : 'text-[var(--text-primary)]'
                                    }`}>
                                        {selectedSession === session.id ? 'data_exploration' : 'chat_bubble'}
                                    </span>
                                </div>

                                {!isCollapsed && (
                                    <>
                                        <span className={`truncate flex-1 text-[11px] font-bold tracking-tight transition-colors duration-500 ${
                                            selectedSession === session.id ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)] group-hover:text-[var(--text-primary)]'
                                        }`}>
                                            {session.title || "Untitled Session"}
                                        </span>

                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onDeleteSession?.(session.id);
                                            }}
                                            className="opacity-0 group-hover:opacity-100 p-2 hover:bg-red-500/20 rounded-xl transition-all"
                                        >
                                            <span className="material-symbols-rounded !text-sm text-red-500/60">delete</span>
                                        </button>
                                    </>
                                )}

                                {selectedSession === session.id && (
                                    <motion.div 
                                        layoutId="active-pill"
                                        className="absolute left-0 w-1 h-6 bg-amber-500 rounded-r-full shadow-[0_0_15px_rgba(245,158,11,0.5)]"
                                    />
                                )}
                            </motion.div>
                        ))
                    ) : (
                        !isCollapsed && (
                            <div className="flex flex-col items-center justify-center py-20 text-center opacity-10">
                                <span className="material-symbols-rounded !text-5xl mb-4 text-[var(--text-primary)]">history</span>
                                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-primary)]">Zero Records</p>
                            </div>
                        )
                    )}
                </div>

                {/* Footer Area */}
                <div className="mt-8 border-t border-[var(--border-subtle)] pt-6 space-y-4">
                    <button
                        onClick={onOpenSettings}
                        className={`flex items-center gap-4 py-3 rounded-2xl hover:bg-[var(--bg-surface-subtle)] transition-all group w-full ${
                            isCollapsed ? 'justify-center px-0' : 'px-3'
                        }`}
                    >
                        <div className="relative shrink-0">
                            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-zinc-800 to-amber-900/40 flex items-center justify-center border border-white/10 shadow-2xl group-hover:border-amber-500/50 transition-all duration-500 overflow-hidden">
                                <span className="text-[10px] font-black text-amber-500 tracking-tighter">PREMIUM</span>
                            </div>
                            <div className="absolute -bottom-1 -right-1 size-4 bg-emerald-500 rounded-full border-4 border-[var(--bg-primary)] shadow-lg" />
                        </div>
                        
                        {!isCollapsed && (
                            <div className="flex-1 text-left min-w-0">
                                <div className="font-black text-xs text-[var(--text-primary)] uppercase tracking-wider truncate group-hover:text-amber-500 transition-colors">Private Banking</div>
                                <div className="text-[9px] text-[var(--text-muted)] font-black uppercase tracking-[0.2em] mt-0.5 opacity-50">Active Session</div>
                            </div>
                        )}
                        
                        {!isCollapsed && (
                             <span className="material-symbols-rounded !text-base text-[var(--text-muted)] group-hover:rotate-180 transition-transform duration-700">settings</span>
                        )}
                    </button>

                    <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'justify-between px-3 pt-2'}`}>
                        {!isCollapsed && <span className="text-[9px] font-black text-[var(--text-muted)] opacity-50 uppercase tracking-[0.3em]">Environment</span>}
                        <div className="scale-90 origin-right">
                             <Darkmode />
                        </div>
                    </div>
                </div>
            </motion.aside>
        </>
    );
}

export default Sidebar;
