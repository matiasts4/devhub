import React, { useEffect, useCallback, useRef } from 'react';
import { X, Copy, Check } from 'lucide-react';

// Language detection from title/content
function detectLanguage(language, title) {
  if (language) return language;
  if (!title) return 'text';
  const lower = title.toLowerCase();
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.ts') || lower.endsWith('.tsx')) return 'typescript';
  if (lower.endsWith('.js') || lower.endsWith('.jsx')) return 'javascript';
  if (lower.endsWith('.py')) return 'python';
  if (lower.endsWith('.go')) return 'go';
  if (lower.endsWith('.sh') || lower.endsWith('.bash')) return 'bash';
  if (lower.endsWith('.md')) return 'markdown';
  if (lower.endsWith('.yaml') || lower.endsWith('.yml')) return 'yaml';
  if (lower.endsWith('.html')) return 'html';
  if (lower.endsWith('.css')) return 'css';
  return 'text';
}

export default function OutputViewerModal({ isOpen, onClose, title, content, language }) {
  const [copied, setCopied] = React.useState(false);
  const overlayRef = useRef(null);

  const handleCopy = useCallback(async () => {
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = content;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [content]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const lang = detectLanguage(language, title);

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div
        style={{
          background: 'var(--surface-muted)',
          borderColor: 'var(--border-strong)',
          borderWidth: 1,
        }}
        className="w-[90vw] max-w-5xl h-[85vh] rounded-2xl shadow-2xl flex flex-col animate-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3 border-b flex-shrink-0"
          style={{ borderBottomWidth: 1, borderBottomColor: 'var(--border-strong)' }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <span
              className="text-xs font-mono px-2 py-0.5 rounded"
              style={{
                color: 'var(--accent-primary)',
                background: 'color-mix(in srgb, var(--accent-primary) 10%, transparent)',
              }}
            >
              {lang}
            </span>
            <h3 className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
              {title || 'Output Viewer'}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono rounded-lg border transition-colors"
              style={{
                background: 'var(--surface-hover)',
                borderColor: 'var(--border-strong)',
                borderWidth: 1,
                color: 'var(--text-muted)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--text-primary)';
                e.currentTarget.style.borderColor =
                  'color-mix(in srgb, var(--accent-primary) 30%, transparent)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--text-muted)';
                e.currentTarget.style.borderColor = 'var(--border-strong)';
              }}
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Copiado</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  Copiar
                </>
              )}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg transition-colors"
              style={{ color: 'var(--text-muted)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--text-primary)';
                e.currentTarget.style.background = 'var(--surface-hover)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--text-muted)';
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content — scrollable, no truncation */}
        <div className="flex-1 overflow-auto p-4">
          <pre
            className="text-xs font-mono whitespace-pre-wrap break-all leading-relaxed"
            style={{ color: 'var(--text-secondary)' }}
          >
            {typeof content === 'string' ? content : JSON.stringify(content, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}
