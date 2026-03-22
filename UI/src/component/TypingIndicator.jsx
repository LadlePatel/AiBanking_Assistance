import React from 'react';

function TypingIndicator() {
    return (
        <div className="flex gap-4 mb-10 w-full md:max-w-4xl mx-auto px-2 md:px-0 message-reveal items-start">
            {/* Avatar */}
            <div className="flex-shrink-0 mt-1">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center shadow-lg shadow-amber-900/20 border border-amber-400/20">
                     <span className="material-symbols-rounded text-white !text-xl">payments</span>
                </div>
            </div>

            {/* Messaging */}
            <div className="flex flex-col gap-2 mt-2">
                <div className="flex items-center gap-3">
                    <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-[0.2em]">AiBank Assistant</span>
                    <div className="flex gap-1.5">
                        <div className="w-1.5 h-1.5 bg-amber-500 rounded-full dot-pulse"></div>
                        <div className="w-1.5 h-1.5 bg-amber-500 rounded-full dot-pulse [animation-delay:0.2s]"></div>
                        <div className="w-1.5 h-1.5 bg-amber-500 rounded-full dot-pulse [animation-delay:0.4s]"></div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default TypingIndicator;
