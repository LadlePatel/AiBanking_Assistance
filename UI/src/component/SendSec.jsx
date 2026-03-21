import React from 'react';

function SendSec({ message }) {
  return (
    <div className="flex justify-end w-full mb-4 message-enter px-4">
      <div className="flex flex-col items-end max-w-[80%] md:max-w-[70%]">
        <div className="bg-[var(--bg-user-msg)] text-[var(--text-user)] font-bold px-4 py-2 rounded-2xl text-[15px] leading-7">
          {message.user_query}
        </div>
      </div>
    </div>
  );
}

export default SendSec;
