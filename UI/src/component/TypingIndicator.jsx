import React from 'react';

function TypingIndicator() {
    return (
        <div className="flex gap-4 mb-8 w-full md:max-w-4xl mx-auto px-4 md:px-0 message-enter">
            {/* Avatar */}
            <div className="flex-shrink-0 flex flex-col items-center">
                <div className="w-8 h-8 rounded-md bg-gradient-to-br from-[var(--accent-color)] to-[var(--accent-color-hover)] flex items-center justify-center shadow-md">
                    <span className="text-white font-bold text-sm">AI</span>
                </div>
            </div>

            {/* Typing animation */}
            <div className="flex items-center gap-2 mt-2">
                <span className="text-sm text-[var(--text-secondary)]">Thinking</span>
                <div className="flex gap-1">
                    <div className="w-2 h-2 bg-[var(--accent-color)] rounded-full dot-pulse"></div>
                    <div className="w-2 h-2 bg-[var(--accent-color)] rounded-full dot-pulse"></div>
                    <div className="w-2 h-2 bg-[var(--accent-color)] rounded-full dot-pulse"></div>
                </div>
            </div>
        </div>
    );
}

export default TypingIndicator;
