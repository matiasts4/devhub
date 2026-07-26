import ChatMarkdown from '@/components/chat/ChatMarkdown';
import { useState, useEffect, useRef } from 'react';
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
export default function StreamingMessage({ contentRef, model: _model }) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentRef]);

  return (
    <div
      className="prose prose-invert prose-sm max-w-none 
                  prose-pre:border 
                  prose-a:text-[color:var(--accent-primary)]
                  prose-blockquote:border-l-[color:var(--accent-primary)] prose-blockquote:py-1 prose-blockquote:pr-4"
      style={{
        '--tw-prose-pre-bg': 'var(--surface-elevated)',
        '--tw-prose-pre-border': 'var(--border-strong)',
        '--tw-prose-code-text': 'var(--accent-primary)',
        '--tw-prose-bold-text': 'var(--text-primary)',
        '--tw-prose-headings-text': 'var(--text-primary)',
        '--tw-prose-body-text': 'var(--text-secondary)',
      }}
    >
      <ChatMarkdown>{content || ''}</ChatMarkdown>
    </div>
  );
}
