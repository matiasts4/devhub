'use client';

import { useState, useRef, useCallback } from 'react';

export default function OperatorComposer({ onSubmit, disabled = false, placeholder }) {
  const [text, setText] = useState('');
  const textareaRef = useRef(null);

  // Auto-grow: measure scrollHeight and set rows dynamically
  const autoGrow = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const maxHeight = 72; // ~3 lines
    const computed = Math.min(el.scrollHeight, maxHeight);
    el.style.height = `${computed}px`;
  }, []);

  const handleChange = useCallback(
    (e) => {
      setText(e.target.value);
      // Schedule auto-grow after the DOM updates
      requestAnimationFrame(autoGrow);
    },
    [autoGrow]
  );

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (text.trim() && !disabled) {
          onSubmit(text.trim());
          setText('');
          // Reset textarea height
          if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
          }
        }
      }
    },
    [text, disabled, onSubmit]
  );

  const handleSubmitClick = useCallback(() => {
    if (text.trim() && !disabled) {
      onSubmit(text.trim());
      setText('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  }, [text, disabled, onSubmit]);

  const isEmpty = !text.trim();

  return (
    <div className="border-t border-[var(--border-subtle)] px-3 py-2">
      <div className="flex gap-2 items-end">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={placeholder || 'Ask the operator anything about the current session...'}
          rows={1}
          aria-label="Operator message input"
          className="flex-1 resize-none min-h-[36px] max-h-[72px] overflow-y-auto rounded-md border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-primary)] focus:border-[var(--accent-primary)] disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ height: 'auto' }}
        />
        <button
          type="button"
          onClick={handleSubmitClick}
          disabled={disabled || isEmpty}
          aria-label="Send message"
          className="shrink-0 rounded-md px-3 py-2 text-[11px] font-semibold transition-colors focus:outline-none focus:ring-1 focus:ring-[var(--accent-primary)] disabled:opacity-40 disabled:cursor-not-allowed bg-[rgba(var(--accent-rgb,88,166,255),0.15)] text-[rgba(var(--accent-rgb,88,166,255),0.9)] hover:bg-[rgba(var(--accent-rgb,88,166,255),0.25)] active:bg-[rgba(var(--accent-rgb,88,166,255),0.35)]"
        >
          Send
        </button>
      </div>
    </div>
  );
}
