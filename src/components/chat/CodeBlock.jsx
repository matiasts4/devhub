import { Check, Copy, WrapText, ListOrdered } from 'lucide-react';
import { useState } from 'react';

/**
 * Inline code component — used for `<code>` elements inside paragraphs.
 * react-markdown v9+ no longer passes `inline` prop; block code is
 * handled by the `pre` override instead.
 */
export function InlineCode({ className: _className, children, ...props }) {
  return (
    <code
      className="rounded px-1.5 py-0.5 text-[0.85em]"
      style={{
        background: 'var(--surface-muted)',
        borderColor: 'var(--border-strong)',
        color: 'var(--accent-primary)',
        border: '1px solid var(--border-strong)',
      }}
      {...props}
    >
      {children}
    </code>
  );
}

/**
 * Block code component — wraps `<pre>` with a header bar (language + copy).
 * react-markdown renders fenced code blocks as <pre><code>...</code></pre>,
 * so we override `pre` to intercept the block.
 */
export function BlockCode({ children, ...props }) {
  const [copied, setCopied] = useState(false);
  const [wrap, setWrap] = useState(false);
  const [showLines, setShowLines] = useState(true);

  // Extract language and optional filename from the nested <code> element's className
  const codeChild = children?.props?.children;
  const codeClassName = children?.props?.className || '';
  const langMatch = /language-(\S+)/.exec(codeClassName || '');
  const rawLang = langMatch ? langMatch[1] : 'text';

  // Parse filename from info string: e.g. "language-typescript:src/foo.ts"
  const [language, filename] = rawLang.includes(':') ? rawLang.split(':', 2) : [rawLang, null];

  const codeText = codeChild ? String(codeChild).replace(/\n$/, '') : '';
  const lines = codeText.split('\n');

  const handleCopy = async () => {
    await navigator.clipboard.writeText(codeText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="my-4 rounded-xl overflow-hidden border"
      style={{ borderColor: 'var(--border-strong)' }}
      {...props}
    >
      {/* Header bar with language, filename, and action buttons */}
      <div
        className="flex items-center justify-between px-4 py-2 border-b"
        style={{
          background: 'var(--surface-muted)',
          borderColor: 'var(--border-strong)',
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-mono lowercase" style={{ color: 'var(--text-muted)' }}>
            {language}
          </span>
          {filename && (
            <span className="text-xs font-mono truncate" style={{ color: 'var(--text-secondary)' }}>
              {filename}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* Toggle line numbers */}
          <button
            onClick={() => setShowLines((v) => !v)}
            className="flex items-center gap-1 px-1.5 py-1 rounded text-xs transition-colors cursor-pointer hover:opacity-80"
            style={{ color: showLines ? 'var(--accent-primary)' : 'var(--text-muted)' }}
            title={showLines ? 'Hide line numbers' : 'Show line numbers'}
          >
            <ListOrdered className="w-3.5 h-3.5" />
          </button>

          {/* Toggle word wrap */}
          <button
            onClick={() => setWrap((v) => !v)}
            className="flex items-center gap-1 px-1.5 py-1 rounded text-xs transition-colors cursor-pointer hover:opacity-80"
            style={{ color: wrap ? 'var(--accent-primary)' : 'var(--text-muted)' }}
            title={wrap ? 'Disable word wrap' : 'Enable word wrap'}
          >
            <WrapText className="w-3.5 h-3.5" />
          </button>

          {/* Copy button */}
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-1.5 py-1 rounded text-xs transition-colors cursor-pointer hover:opacity-80"
            style={{ color: copied ? 'var(--success)' : 'var(--text-muted)' }}
            title="Copy to clipboard"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Copy</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Code body */}
      <div
        className="p-4 font-mono text-sm"
        style={{
          background: 'var(--surface-elevated)',
          overflowX: wrap ? 'hidden' : 'auto',
          whiteSpace: wrap ? 'pre-wrap' : 'pre',
          wordBreak: wrap ? 'break-word' : 'normal',
        }}
      >
        {showLines ? (
          <div className="flex">
            {/* Line numbers — non-selectable gutter */}
            <div
              className="flex-shrink-0 pr-4 text-right select-none border-r"
              style={{
                color: 'var(--text-muted)',
                opacity: 0.4,
                borderColor: 'var(--border-subtle)',
              }}
              aria-hidden="true"
            >
              {lines.map((_, i) => (
                <div key={i} className="leading-6">
                  {i + 1}
                </div>
              ))}
            </div>
            {/* Code content */}
            <div className="pl-4 flex-1 min-w-0">
              {lines.map((line, i) => (
                <div key={i} className="leading-6">
                  {line || ' '}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div>
            {lines.map((line, i) => (
              <div key={i}>{line || ' '}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Default export kept for backwards compatibility — use InlineCode.
 */
export default InlineCode;
