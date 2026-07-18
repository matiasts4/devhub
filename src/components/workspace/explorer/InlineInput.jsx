'use client';

import { useEffect, useRef } from 'react';

export function InlineInput({ initial = '', placeholder = '', onCommit, onCancel }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.select();
  }, []);

  return (
    <input
      ref={ref}
      type="text"
      defaultValue={initial}
      placeholder={placeholder}
      data-testid="explorer-inline-input"
      className="min-w-0 flex-1 rounded-sm border border-borders-subtle bg-surface-elevated px-1 py-0.5 text-[13px] text-text-primary outline-none focus:border-accent-primary"
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          void onCommit?.(e.currentTarget.value);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          onCancel?.();
        }
      }}
      onBlur={(e) => {
        void onCommit?.(e.currentTarget.value);
      }}
      onClick={(e) => e.stopPropagation()}
    />
  );
}
