import MarkdownReact from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';
import { InlineCode, BlockCode } from '@/components/chat/CodeBlock';

/**
 * Shared Markdown renderer with GFM + syntax highlighting + custom code blocks.
 * Used across all message types (user, assistant, MCP).
 *
 * react-markdown v9+ changes:
 * - `code` component handles inline code only
 * - `pre` component handles fenced/block code (wraps <pre><code>...</code></pre>)
 * - `inline` prop is no longer passed to code components
 */
/**
 * Safe highlight wrapper to prevent crashes during active streaming
 * of incomplete or malformed code blocks.
 */
const safeHighlight = (options) => {
  const highlighter = rehypeHighlight(options);
  return (tree, file) => {
    try {
      if (highlighter) highlighter(tree, file);
    } catch (e) {
      console.warn('rehype-highlight ignorable stream error:', e.message);
    }
  };
};

export default function ChatMarkdown({ children }) {
  return (
    <MarkdownReact
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[[safeHighlight, { ignoreMissing: true }]]}
      components={{
        code: InlineCode,
        pre: BlockCode,
      }}
    >
      {children}
    </MarkdownReact>
  );
}
