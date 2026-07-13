import React from 'react';

export default function ChannelLayout({
  children,
  thread,
}: {
  children: React.ReactNode;
  thread: React.ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {children}
      </div>
      {thread}
    </div>
  );
}
