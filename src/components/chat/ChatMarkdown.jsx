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
export default function ChatMarkdown({ children }) {
  return (
    <MarkdownReact
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight]}
      components={{
        code: InlineCode,
        pre: BlockCode,
      }}
    >
      {children}
    </MarkdownReact>
  );
}
