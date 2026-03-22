import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { FaPlus, FaServer, FaTrash } from 'react-icons/fa';



const SettingsModal = ({ isOpen, onClose }) => {
    const [activeTab, setActiveTab] = useState('general');
    useEffect(() => {
        if (isOpen) {
            setActiveTab('general');
        }
    }, [isOpen]);


    if (!isOpen) return null;

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className="fixed inset-0 bg-black/70 backdrop-blur-md z-40"
                        onClick={onClose}
                    />

                    {/* Modal */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 10 }}
                        transition={{ type: "spring", damping: 25, stiffness: 300 }}
                        className="fixed inset-0 z-50 flex items-center justify-center px-4"
                        onClick={(e) => e.target === e.currentTarget && onClose()}
                    >
                        <div className="bg-[var(--bg-primary)] w-full max-w-5xl rounded-3xl shadow-2xl overflow-hidden border border-[var(--border-medium)] relative">
                            {/* Gradient accent bar */}
                            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[var(--accent-color)] via-[var(--accent-color-hover)] to-[var(--accent-color)]"></div>

                            {/* Header */}
                            <div className="p-6 border-b border-[var(--border-medium)] flex justify-between items-center bg-gradient-to-br from-[var(--bg-secondary)] to-[var(--bg-primary)]">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--accent-color)] to-[var(--accent-color-hover)] flex items-center justify-center shadow-lg">
                                        <span className="material-symbols-rounded text-white text-[20px]">settings</span>
                                    </div>
                                    <h2 className="text-2xl font-bold text-[var(--text-primary)]">
                                        Settings
                                    </h2>
                                </div>
                                <button
                                    onClick={onClose}
                                    className="p-2 hover:bg-[var(--bg-input)] rounded-xl transition-all duration-200 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:rotate-90"
                                >
                                    <span className="material-symbols-rounded">close</span>
                                </button>
                            </div>

                            <div className="flex h-[600px]">
                                {/* Tab Navigation */}
                                <div className="w-1/4 border-r border-[var(--border-medium)] bg-[var(--bg-secondary)] p-6">
                                    <div className="space-y-2">
                                        {[
                                            { id: 'general', icon: 'tune', label: 'General', iconType: 'material' }
                                        ].map(tab => (
                                            <button
                                                key={tab.id}
                                                className={`w-full text-left px-4 py-3 rounded-xl flex items-center gap-3 font-semibold transition-all duration-200 text-sm group relative overflow-hidden ${activeTab === tab.id
                                                    ? 'bg-gradient-to-r from-[var(--accent-color)]/20 to-[var(--accent-color)]/10 text-[var(--accent-color)] border-2 border-[var(--accent-color)]/40 shadow-md'
                                                    : 'hover:bg-[var(--bg-input)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border-2 border-transparent hover:border-[var(--border-medium)]'
                                                    }`}
                                                onClick={() => setActiveTab(tab.id)}
                                            >
                                                {activeTab === tab.id && (
                                                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-[var(--accent-color)] to-[var(--accent-color-hover)] rounded-r-full"></div>
                                                )}
                                                <div className={`flex items-center justify-center transition-transform duration-200 ${activeTab === tab.id ? 'scale-110' : 'group-hover:scale-105'
                                                    }`}>
                                                    {tab.iconType === 'material' ? (
                                                        <span className="material-symbols-rounded text-[20px]">{tab.icon}</span>
                                                    ) : (
                                                        <span className="text-[16px]">{tab.icon}</span>
                                                    )}
                                                </div>
                                                <span className="flex-1">{tab.label}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Content Area */}
                                <div className="w-3/4 p-6 overflow-y-auto bg-[var(--bg-primary)]">
                                    {/* General Tab */}
                                    {activeTab === 'general' && (
                                        <div className="space-y-6">
                                            <div>
                                                <div className="flex items-center gap-2 mb-6">
                                                    <div className="h-8 w-1 bg-gradient-to-b from-[var(--accent-color)] to-[var(--accent-color-hover)] rounded-full"></div>
                                                    <h3 className="text-xl font-bold text-[var(--text-primary)]">About AI Banking Assistant</h3>
                                                </div>
                                                <div className="p-8 bg-gradient-to-br from-[var(--bg-secondary)] to-[var(--bg-primary)] rounded-2xl border border-[var(--border-medium)] shadow-lg relative overflow-hidden">
                                                    {/* Decorative gradient orb */}
                                                    <div className="absolute -top-10 -right-10 w-32 h-32 bg-[var(--accent-color)]/10 rounded-full blur-3xl"></div>
                                                    <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-[var(--accent-color-hover)]/10 rounded-full blur-3xl"></div>

                                                    <div className="flex items-center gap-6 mb-6 relative z-10">
                                                        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[var(--accent-color)] via-[var(--accent-color-hover)] to-[var(--accent-color)] flex items-center justify-center shadow-xl relative">
                                                            <div className="absolute inset-0 bg-white/20 rounded-2xl animate-pulse"></div>
                                                            <span className="material-symbols-rounded text-white text-4xl relative z-10">auto_awesome</span>
                                                        </div>
                                                        <div>
                                                            <h4 className="font-bold text-[var(--text-primary)] text-2xl mb-1">AI Banking Assistant</h4>
                                                            <p className="text-[var(--text-secondary)] text-sm">Your intelligent AI assistant</p>
                                                            <div className="flex items-center gap-2 mt-2">
                                                                <span className="px-2 py-0.5 bg-[var(--accent-color)]/20 text-[var(--accent-color)] text-xs font-semibold rounded-full">v1.0</span>
                                                                <span className="px-2 py-0.5 bg-green-500/20 text-green-500 text-xs font-semibold rounded-full flex items-center gap-1">
                                                                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                                                                    Active
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="text-sm text-[var(--text-muted)] border-t border-[var(--border-subtle)] pt-6 relative z-10">
                                                        <p className="flex items-center gap-2">
                                                            Crafted with <span className="text-red-500 animate-pulse">♥</span> by
                                                            <a href="https://sayeedcodes.web.app" target="_blank" rel="noopener noreferrer" className="text-[var(--accent-color)] hover:text-[var(--accent-color-hover)] font-semibold transition-colors hover:underline">
                                                                Sayeed Ajmal
                                                            </a>
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                </div>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};

export default SettingsModal;