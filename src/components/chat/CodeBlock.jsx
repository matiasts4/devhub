import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

/**
 * Inline code component — used for `<code>` elements inside paragraphs.
 * react-markdown v9+ no longer passes `inline` prop; block code is
 * handled by the `pre` override instead.
 */
export function InlineCode({ className, children, ...props }) {
  return (
    <code
      className="bg-[#111825] border border-[#2a3441] rounded px-1.5 py-0.5 text-[#9bc2ff] text-[0.85em]"
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

  // Extract language from the nested <code> element's className
  const codeChild = children?.props?.children;
  const codeClassName = children?.props?.className || '';
  const match = /language-(\w+)/.exec(codeClassName || '');
  const language = match ? match[1] : 'text';
  const codeText = codeChild ? String(codeChild).replace(/\n$/, '') : '';

  const handleCopy = async () => {
    await navigator.clipboard.writeText(codeText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="my-4 rounded-xl overflow-hidden border border-[#2a3441] bg-[#0c1018]"
      {...props}
    >
      {/* Header bar with language + copy button */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#111825] border-b border-[#2a3441]">
        <span className="text-xs text-gray-500 font-mono lowercase">{language}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors cursor-pointer"
          title="Copy to clipboard"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      {/* Code body — render the original <code> child */}
      <div className="p-4 overflow-x-auto">{children}</div>
    </div>
  );
}

/**
 * Default export kept for backwards compatibility — use InlineCode.
 */
export default InlineCode;
