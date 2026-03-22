import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';

const SettingsModal = ({ isOpen, onClose }) => {
    const [activeTab, setActiveTab] = useState('general');
    
    useEffect(() => {
        if (isOpen) {
            setActiveTab('general');
        }
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <AnimatePresence mode="wait">
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                    />

                    {/* Modal */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="relative w-full max-w-4xl glass border border-[var(--border-subtle)] rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col bg-[var(--bg-glass)]"
                    >
                        <div className="flex items-center justify-between p-8 border-b border-[var(--border-subtle)]">
                            <div className="flex items-center gap-4">
                                <div className="size-12 rounded-[1rem] bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                                    <span className="material-symbols-rounded text-amber-500 text-2xl">settings</span>
                                </div>
                                <div>
                                    <h2 className="text-2xl font-display font-bold text-[var(--text-primary)] tracking-tight">System Configuration</h2>
                                    <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-amber-500/60 mt-0.5">
                                        Agent Operations & Environment
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={onClose}
                                className="size-10 rounded-xl bg-[var(--bg-surface-subtle)] text-[var(--text-muted)] hover:bg-red-500 hover:text-white transition-all flex items-center justify-center"
                            >
                                <span className="material-symbols-rounded">close</span>
                            </button>
                        </div>

                        <div className="flex h-[500px]">
                            {/* Sidebar Nav */}
                            <div className="w-64 border-r border-[var(--border-subtle)] bg-[var(--bg-glass)]/20 p-6 flex flex-col gap-2">
                                {[
                                    { id: 'general', icon: 'tune', label: 'General' },
                                    { id: 'security', icon: 'security', label: 'Security' },
                                    { id: 'api', icon: 'api', label: 'Nodes' }
                                ].map(tab => (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActiveTab(tab.id)}
                                        className={`group flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${activeTab === tab.id 
                                            ? 'bg-amber-500 text-black font-bold shadow-lg shadow-amber-500/20' 
                                            : 'text-[var(--text-muted)] hover:bg-[var(--bg-surface-subtle)] hover:text-[var(--text-primary)]'}`}
                                    >
                                        <span className={`material-symbols-rounded text-xl ${activeTab === tab.id ? 'fill-1' : 'group-hover:scale-110 transition-transform'}`}>
                                            {tab.icon}
                                        </span>
                                        <span className="text-xs uppercase tracking-widest">{tab.label}</span>
                                    </button>
                                ))}
                                
                                <div className="mt-auto pt-6 border-t border-[var(--border-subtle)]">
                                    <div className="p-4 rounded-2xl bg-[var(--bg-surface-subtle)] border border-[var(--border-subtle)]">
                                        <p className="text-[10px] uppercase tracking-widest font-bold text-[var(--text-muted)] mb-2 text-center">Engine Core</p>
                                        <p className="text-center font-display font-black text-amber-500 text-xl tracking-tighter italic">V1.0.4-PRO</p>
                                    </div>
                                </div>
                            </div>

                            {/* Content */}
                            <div className="flex-1 p-10 overflow-y-auto custom-scrollbar">
                                {activeTab === 'general' && (
                                    <motion.div 
                                        initial={{ opacity: 0, x: 10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        className="space-y-8"
                                    >
                                        <section>
                                            <div className="flex items-center gap-3 mb-6">
                                                <div className="h-6 w-1 bg-amber-500 rounded-full" />
                                                <h3 className="text-lg font-bold text-[var(--text-primary)] tracking-tight">Agent Workspace</h3>
                                            </div>
                                            
                                            <div className="p-8 glass bg-[var(--bg-surface-subtle)] border-[var(--border-subtle)] rounded-[2rem] relative overflow-hidden group">
                                                <div className="absolute top-0 right-0 size-40 bg-amber-500/10 rounded-full blur-[80px] group-hover:bg-amber-500/20 transition-all duration-1000" />
                                                
                                                <div className="flex items-center gap-8 mb-8 relative z-10">
                                                    <div className="size-20 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center shadow-xl shadow-amber-500/20 relative">
                                                        <div className="absolute inset-0 bg-white/20 rounded-2xl animate-pulse" />
                                                        <span className="material-symbols-rounded text-black text-4xl font-bold">auto_awesome</span>
                                                    </div>
                                                    <div>
                                                        <h4 className="text-2xl font-display font-black text-[var(--text-primary)] mb-1">AI Banking Assistant</h4>
                                                        <p className="text-amber-500/60 text-xs font-bold uppercase tracking-[0.2em]">Next-Gen Fiscal Oracle</p>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-2 gap-4 mb-8">
                                                    {[
                                                        { label: 'Latency', value: '14ms', icon: 'bolt' },
                                                        { label: 'Security', value: 'AES-256', icon: 'encrypted' }
                                                    ].map((stat, i) => (
                                                        <div key={i} className="p-4 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] flex items-center gap-3">
                                                            <span className="material-symbols-rounded text-amber-500/40 text-sm">{stat.icon}</span>
                                                            <div className="flex flex-col text-left">
                                                                <span className="text-[10px] text-[var(--text-muted)] uppercase font-bold tracking-widest">{stat.label}</span>
                                                                <span className="text-sm font-bold text-[var(--text-primary)]">{stat.value}</span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>

                                                <div className="pt-6 border-t border-[var(--border-subtle)] flex items-center justify-between">
                                                    <p className="text-[10px] text-[var(--text-muted)] font-medium uppercase tracking-widest">
                                                        Authenticated via <span className="text-amber-500/60 font-black italic">Sayeed Ajmal</span>
                                                    </p>
                                                    <a 
                                                        href="https://sayeedcodes.web.app" 
                                                        target="_blank" 
                                                        rel="noopener noreferrer"
                                                        className="text-[10px] font-black text-white hover:text-amber-500 transition-colors uppercase tracking-[0.2em] flex items-center gap-2"
                                                    >
                                                        Source Code <span className="material-symbols-rounded text-[14px]">open_in_new</span>
                                                    </a>
                                                </div>
                                            </div>
                                        </section>
                                    </motion.div>
                                )}
                                
                                {activeTab !== 'general' && (
                                    <div className="flex flex-col items-center justify-center h-full text-center">
                                        <div className="size-16 rounded-full bg-[var(--bg-surface-subtle)] border border-[var(--border-subtle)] flex items-center justify-center mb-4 text-[var(--text-muted)]">
                                            <span className="material-symbols-rounded text-3xl">lock</span>
                                        </div>
                                        <h4 className="text-[var(--text-primary)] font-bold tracking-tight uppercase text-xs tracking-[0.3em]">Protocol Encrypted</h4>
                                        <p className="text-[10px] text-[var(--text-muted)] mt-2 font-medium">Access restricted in current session environment.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

export default SettingsModal;