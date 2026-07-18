/** Monaco language id from file path — keep in sync with editor UX. */
export function detectCodeLanguage(filePath) {
  const lower = String(filePath || '').toLowerCase();
  const base = lower.split(/[/\\]/).pop() || lower;

  if (base === 'dockerfile' || base.startsWith('dockerfile.')) return 'dockerfile';
  if (base === 'makefile' || base === 'gnumakefile') return 'plaintext';
  if (base === 'cmakelists.txt') return 'plaintext';

  if (lower.endsWith('.ts') || lower.endsWith('.mts') || lower.endsWith('.cts'))
    return 'typescript';
  if (lower.endsWith('.tsx')) return 'typescript';
  if (lower.endsWith('.js') || lower.endsWith('.mjs') || lower.endsWith('.cjs'))
    return 'javascript';
  if (lower.endsWith('.jsx')) return 'javascript';
  if (lower.endsWith('.json') || lower.endsWith('.jsonc')) return 'json';
  if (lower.endsWith('.md') || lower.endsWith('.mdx')) return 'markdown';
  if (lower.endsWith('.css')) return 'css';
  if (lower.endsWith('.scss')) return 'scss';
  if (lower.endsWith('.less')) return 'less';
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'html';
  if (lower.endsWith('.xml')) return 'xml';
  if (lower.endsWith('.yml') || lower.endsWith('.yaml')) return 'yaml';
  if (lower.endsWith('.toml')) return 'ini';
  if (lower.endsWith('.ini') || lower.endsWith('.cfg') || lower.endsWith('.conf')) return 'ini';
  if (lower.endsWith('.sh') || lower.endsWith('.bash') || lower.endsWith('.zsh')) return 'shell';
  if (lower.endsWith('.ps1')) return 'powershell';
  if (lower.endsWith('.py')) return 'python';
  if (lower.endsWith('.rs')) return 'rust';
  if (lower.endsWith('.go')) return 'go';
  if (lower.endsWith('.java')) return 'java';
  if (lower.endsWith('.kt') || lower.endsWith('.kts')) return 'kotlin';
  if (lower.endsWith('.swift')) return 'swift';
  if (lower.endsWith('.c') || lower.endsWith('.h')) return 'c';
  if (
    lower.endsWith('.cpp') ||
    lower.endsWith('.cc') ||
    lower.endsWith('.cxx') ||
    lower.endsWith('.hpp')
  ) {
    return 'cpp';
  }
  if (lower.endsWith('.cs')) return 'csharp';
  if (lower.endsWith('.php')) return 'php';
  if (lower.endsWith('.rb')) return 'ruby';
  if (lower.endsWith('.sql')) return 'sql';
  if (lower.endsWith('.graphql') || lower.endsWith('.gql')) return 'graphql';
  if (lower.endsWith('.vue')) return 'html';
  if (lower.endsWith('.svelte')) return 'html';
  if (lower.endsWith('.tex') || lower.endsWith('.latex') || lower.endsWith('.ltx')) return 'latex';
  if (lower.endsWith('.diff') || lower.endsWith('.patch')) return 'plaintext';

  return 'plaintext';
}

/** Paths that keep DevHub's document preview (not the code/diff surface). */
export function isDocumentPreviewPath(filePath) {
  const lower = String(filePath || '').toLowerCase();
  return (
    lower.endsWith('.md') ||
    lower.endsWith('.mdx') ||
    lower.endsWith('.tex') ||
    lower.endsWith('.latex') ||
    lower.endsWith('.ltx')
  );
}

export function isCodeDiffablePath(filePath) {
  if (!filePath) return false;
  if (isDocumentPreviewPath(filePath)) return false;
  const lower = String(filePath).toLowerCase();
  if (lower.match(/\.(png|jpe?g|gif|webp|svg|pdf|mp3|mp4|docx?|xlsx?|zip|gz|tgz|exe|dll|wasm)$/)) {
    return false;
  }
  return true;
}

export const MONACO_CODE_OPTIONS = {
  readOnly: true,
  minimap: { enabled: false },
  fontSize: 13,
  fontFamily: '"JetBrains Mono", Consolas, "Courier New", monospace',
  fontLigatures: true,
  lineHeight: 20,
  wordWrap: 'on',
  wrappingIndent: 'indent',
  scrollBeyondLastLine: false,
  padding: { top: 12, bottom: 12 },
  renderLineHighlight: 'line',
  smoothScrolling: true,
  cursorBlinking: 'solid',
  bracketPairColorization: { enabled: true },
  guides: { indentation: true, bracketPairs: true },
  scrollbar: {
    verticalScrollbarSize: 8,
    horizontalScrollbarSize: 8,
  },
};

export const MONACO_DIFF_OPTIONS = {
  ...MONACO_CODE_OPTIONS,
  renderSideBySide: true,
  originalEditable: false,
  readOnly: true,
  renderIndicators: true,
  ignoreTrimWhitespace: false,
};
