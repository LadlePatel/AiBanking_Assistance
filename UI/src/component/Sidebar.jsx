import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Darkmode from './Darkmode';

function Sidebar({ isOpen, onClose, isCollapsed, onToggleCollapse, onNewChat, historySessions, selectedSession, onSessionSelect, onDeleteSession, onOpenSettings }) {
    // Reactive viewport detection (SSR-safe)
    const [isDesktop, setIsDesktop] = useState(() => {
        if (typeof window !== "undefined") {
            return window.innerWidth >= 768;
        }
        return true; // Default to desktop for SSR
    });

    useEffect(() => {
        if (typeof window === "undefined") return;

        const handleResize = () => {
            setIsDesktop(window.innerWidth >= 768);
        };

        // Set initial value
        handleResize();

        // Add listener
        window.addEventListener('resize', handleResize);

        // Cleanup
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const handleNewChat = () => {
        onNewChat?.();
        if (!isDesktop) {
            onClose?.();
        }
    };

    return (
        <>
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 md:hidden"
                    onClick={onClose}
                />
            )}

            <motion.aside
                className={`fixed md:relative z-50 flex flex-col h-full bg-[var(--bg-secondary)] text-[var(--text-primary)] p-2 md:translate-x-0 transition-all duration-300 ${isOpen ? 'translate-x-0' : '-translate-x-full'
                    }`}
                initial={false}
                animate={{
                    width: isCollapsed && isDesktop ? '60px' : '260px',
                    x: isOpen || isDesktop ? 0 : '-100%'
                }}
                transition={{
                    duration: 0.3,
                    ease: "easeInOut"
                }}
            >
                {/* Collapse Toggle Button (Desktop only) */}
                <div className="hidden md:flex items-center justify-between mb-2">
                    {!isCollapsed && (
                        <span className="text-xs font-semibold text-[var(--text-muted)] px-2">MENU</span>
                    )}
                    <button
                        onClick={onToggleCollapse}
                        className={`p-2 hover:bg-[var(--bg-input)] rounded-lg transition-colors ${isCollapsed ? 'mx-auto' : 'ml-auto'}`}
                        aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                    >
                        <span className="material-symbols-rounded text-[20px] font-bold text-[var(--text-secondary)] icon-filled">
                            {isCollapsed ? 'chevron_right' : 'chevron_left'}
                        </span>
                    </button>
                </div>
                {/* New Chat Button */}
                <div className="mb-3">
                    <button
                        onClick={handleNewChat}
                        className={`flex items-center gap-3 py-2.5 w-full rounded-3xl hover:bg-[var(--bg-input)] transition-all duration-200 border border-[var(--border-medium)] hover:border-[var(--accent-color)]/30 text-sm group ${isCollapsed ? 'justify-center px-0' : 'px-3'
                            }`}
                        title={isCollapsed ? "New chat" : ""}
                    >
                        <span className="material-symbols-rounded text-[22px] font-bold text-[var(--accent-color)] group-hover:scale-110 transition-transform icon-filled">add_circle</span>
                        {!isCollapsed && <span className="font-bold text-[var(--text-primary)]">New chat</span>}
                    </button>
                </div>

                {/* History List */}
                <div className="flex-1 overflow-y-auto overflow-x-hidden space-y-1 pr-1 custom-scrollbar">
                    {!isCollapsed && (
                        <div className="text-xs font-semibold text-[var(--text-muted)] px-3 py-2 uppercase tracking-wide">Recent</div>
                    )}
                    {historySessions.length > 0 ? (
                        historySessions.map((session) => (
                            <div
                                key={session.id}
                                className={`group relative flex items-center gap-3 py-2.5 rounded-lg cursor-pointer text-sm transition-all duration-200 ${selectedSession === session.id
                                    ? 'bg-[var(--bg-input)]'
                                    : 'hover:bg-[var(--bg-input)]'
                                    } ${isCollapsed ? 'justify-center px-0' : 'px-3'}`}
                                onClick={() => {
                                    onSessionSelect?.(session.id);
                                    if (!isDesktop) onClose();
                                }}
                                title={isCollapsed ? (session.title || "New Chat") : ""}
                            >
                                <span className="material-symbols-rounded text-[20px] font-medium text-[var(--text-secondary)] icon-filled">chat_bubble</span>
                                {!isCollapsed && (
                                    <>
                                        <span className="truncate flex-1 text-[var(--text-primary)] text-[14px] font-medium">
                                            {session.title || "New Chat"}
                                        </span>

                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onDeleteSession?.(session.id);
                                            }}
                                            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/20 rounded transition-all duration-200"
                                        >
                                            <span className="material-symbols-rounded text-[18px] text-red-400 font-bold icon-filled">delete</span>
                                        </button>
                                    </>
                                )}
                            </div>
                        ))
                    ) : (
                        !isCollapsed && (
                            <div className="flex flex-col items-center justify-center py-8 text-center">
                                <span className="material-symbols-rounded text-4xl text-[var(--text-muted)] mb-2 icon-filled">history</span>
                                <p className="text-xs text-[var(--text-muted)] font-medium">No chat history yet</p>
                            </div>
                        )
                    )}
                </div>

                {/* Footer Area */}
                <div className="mt-auto border-t border-[var(--border-medium)] pt-3 flex items-center gap-2">
                    <button
                        onClick={onOpenSettings}
                        className={`flex items-center gap-3 py-2.5 rounded-lg hover:bg-[var(--bg-input)] transition-all duration-200 text-sm group flex-1 ${isCollapsed ? 'justify-center px-0' : 'px-3'
                            }`}
                        title={isCollapsed ? "Settings" : ""}
                    >
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[var(--accent-color)] to-[var(--accent-color-hover)] flex items-center justify-center text-white font-semibold text-sm shadow-sm relative shrink-0">
                            AG
                        </div>
                        {!isCollapsed && (
                            <div className="flex-1 text-left overflow-hidden">
                                <div className="font-medium text-[var(--text-primary)] truncate">Settings</div>
                                <div className="text-xs text-[var(--text-muted)] truncate">Manage preferences</div>
                            </div>
                        )}
                    </button>

                    {!isCollapsed && (
                        <div className="pr-2">
                            <Darkmode />
                        </div>
                    )}
                </div>
                {/* Collapsed Mode: Show Toggle below settings if desired, or maybe hidden? User asked for "side of setting icon". 
                    In collapsed mode, sidebar is 60px wide. Side-by-side won't fit well.
                    Let's just show it only when expanded for now to keep it clean, OR stack it.
                    Actually, if I put it OUTSIDE the button flex container but in the footer div...
                 */}
                {isCollapsed && (
                    <div className="flex justify-center pb-2">
                        <div className="scale-75">
                            <Darkmode />
                        </div>
                    </div>
                )}
            </motion.aside>
        </>
    );
}

export default Sidebar;
