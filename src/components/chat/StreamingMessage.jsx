import { useState, useEffect, useRef, useMemo } from 'react';
import ChatMarkdown from '@/components/chat/ChatMarkdown';
import { createTagParser } from './utils/tagStateMachine';

/**
 * StreamingMessage — isolates re-renders during SSE streaming.
 *
 * How it works:
 * 1. Parent creates a useRef('') for streaming content
 * 2. Each SSE chunk updates contentRef.current += chunk (NO state update, NO re-render)
 * 3. This component uses requestAnimationFrame to sync ref to local state at ~60fps
 * 4. Tag state machine transforms execute tags into loading/result UI without flicker
 * 5. Only THIS component re-renders — the rest of the message list is static
 * 6. When streaming completes, parent flushes final content to messages state
 */
export default function StreamingMessage({ contentRef, model, className = '' }) {
  const [content, setContent] = useState('');
  const rafRef = useRef(null);
  const parserRef = useRef(createTagParser());

  useEffect(() => {
    const tick = () => {
      // Sync from ref to state — this is the ONLY re-render trigger
      const next = contentRef.current;
      if (next !== content) {
        // Feed through state machine for flicker-free tag rendering
        parserRef.current.reset();
        const display = parserRef.current.feed(next);
        setContent(display);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [contentRef, content]);

  return (
    <div className={`flex gap-4 mb-2 ${className}`}>
      <div className="w-9 h-9 mt-1 rounded-xl flex-shrink-0 flex items-center justify-center bg-[#5b8cff]/10 border border-[#5b8cff]/30 shadow-[0_0_15px_rgba(91,140,255,0.15)]">
        <div className="flex gap-1">
          <div className="w-1 h-1 rounded-full bg-[#5b8cff] animate-bounce" />
          <div
            className="w-1 h-1 rounded-full bg-[#5b8cff] animate-bounce"
            style={{ animationDelay: '0.15s' }}
          />
          <div
            className="w-1 h-1 rounded-full bg-[#5b8cff] animate-bounce"
            style={{ animationDelay: '0.3s' }}
          />
        </div>
      </div>

      <div className="max-w-[88%] rounded-2xl px-5 py-4 bg-transparent text-gray-300">
        <div
          className="prose prose-invert prose-sm max-w-none 
                      prose-pre:bg-[#0c1018] prose-pre:border prose-pre:border-[#2a3441] 
                      prose-code:text-[#9bc2ff] prose-a:text-[#5b8cff]
                      prose-blockquote:border-l-[#5b8cff] prose-blockquote:bg-[#5b8cff]/5 prose-blockquote:py-1 prose-blockquote:pr-4"
        >
          <ChatMarkdown>{content || ''}</ChatMarkdown>
        </div>
        {model && <div className="mt-2 text-[10px] text-gray-600 font-mono">{model}</div>}
      </div>
    </div>
  );
}
