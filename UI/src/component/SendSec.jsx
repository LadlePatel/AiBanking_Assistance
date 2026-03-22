import React from 'react';

function SendSec({ message }) {
  return (
    <div className="flex justify-end w-full mb-6 message-reveal px-4">
      <div className="flex flex-col items-end max-w-[85%] md:max-w-[70%]">
        <div className="bg-[var(--bg-user-msg)] text-[var(--text-user)] font-medium px-5 py-3 rounded-2xl rounded-tr-sm text-[15px] leading-relaxed border border-[var(--border-subtle)] shadow-sm">
          {message.user_query}
        </div>
      </div>
    </div>
  );
}

export default SendSec;
