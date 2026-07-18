const React = require('react');
const { createRoot } = require('react-dom/client');
const { flushSync } = require('react-dom');
const { JSDOM } = require('jsdom');

jest.mock('@monaco-editor/react', () => {
  const React = require('react');
  const Editor = ({ language, value }) =>
    React.createElement(
      'div',
      { 'data-testid': 'monaco-editor' },
      `${language || 'plaintext'}::${value || ''}`
    );
  const DiffEditor = ({ language, original, modified }) =>
    React.createElement(
      'div',
      { 'data-testid': 'monaco-diff-editor' },
      `${language || 'plaintext'}::${original || ''}=>${modified || ''}`
    );
  return { __esModule: true, default: Editor, DiffEditor };
});

jest.mock('react-markdown', () => ({
  __esModule: true,
  default: ({ children }) => {
    const React = require('react');
    return React.createElement('div', { 'data-testid': 'markdown-preview' }, children);
  },
}));

jest.mock('remark-gfm', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('rehype-highlight', () => ({ __esModule: true, default: jest.fn(() => jest.fn()) }));
jest.mock('highlight.js/styles/github-dark.css', () => ({}), { virtual: true });

jest.mock('@/components/chat/CodeBlock', () => ({
  InlineCode: ({ children }) => {
    const React = require('react');
    return React.createElement('code', null, children);
  },
  BlockCode: ({ children }) => {
    const React = require('react');
    return React.createElement('pre', null, children);
  },
}));

jest.mock('../workspace/LatexDocumentPreview', () => ({
  __esModule: true,
  default: ({ content, filePath }) => {
    const React = require('react');
    return React.createElement(
      'div',
      { 'data-testid': 'latex-preview' },
      `${filePath}::${String(content || '').slice(0, 40)}`
    );
  },
}));

jest.mock('@/components/ui/resizable', () => {
  const React = require('react');

  const ResizablePanelGroup = ({ children }) => React.createElement('div', null, children);

  const ResizablePanel = React.forwardRef(
    ({ children, defaultSize, onCollapse, onExpand }, ref) => {
      const [collapsed, setCollapsed] = React.useState(defaultSize === 0);

      React.useImperativeHandle(
        ref,
        () => ({
          collapse: () => {
            setCollapsed((previous) => {
              if (!previous) onCollapse?.();
              return true;
            });
          },
          expand: () => {
            setCollapsed((previous) => {
              if (previous) onExpand?.();
              return false;
            });
          },
        }),
        [onCollapse, onExpand]
      );

      return React.createElement(
        'div',
        { 'data-testid': 'mock-panel', 'data-collapsed': collapsed ? 'true' : 'false' },
        collapsed ? null : children
      );
    }
  );

  const ResizableHandle = () => React.createElement('div', { 'data-testid': 'mock-handle' });

  return { ResizablePanelGroup, ResizablePanel, ResizableHandle };
});

jest.mock('lucide-react', () => {
  const icon = (name) => (props) => {
    const React = require('react');
    return React.createElement('svg', { ...props, 'data-icon': name });
  };

  return new Proxy(
    {},
    {
      get: (_, key) => icon(String(key)),
    }
  );
});

jest.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }) => ({
    getVirtualItems: () => [],
    getTotalSize: () => count * 24,
    scrollToIndex: jest.fn(),
  }),
}));

jest.mock('@iconify-json/catppuccin/icons.json', () => ({
  width: 16,
  height: 16,
  icons: {
    file: { body: '<path d="M0 0"/>' },
    folder: { body: '<path d="M0 0"/>' },
    'folder-open': { body: '<path d="M0 0"/>' },
    javascript: { body: '<path d="M0 0"/>' },
    markdown: { body: '<path d="M0 0"/>' },
    tex: { body: '<path d="M0 0"/>' },
    react: { body: '<path d="M0 0"/>' },
  },
}));

const FileExplorerEditorPane = require('../workspace/FileExplorerEditorPane').default;

function installDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://devhub.test',
  });

  global.window = dom.window;
  global.document = dom.window.document;
  global.navigator = dom.window.navigator;
  global.localStorage = dom.window.localStorage;
  global.HTMLElement = dom.window.HTMLElement;
  global.Node = dom.window.Node;
  global.MouseEvent = dom.window.MouseEvent;
  global.WheelEvent = dom.window.WheelEvent;

  return dom;
}

const mountedRoots = [];

async function flushEffects() {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function renderIntoDom(element) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push({ root, container });

  flushSync(() => {
    root.render(element);
  });

  await flushEffects();

  return { container };
}

async function click(element) {
  flushSync(() => {
    element.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  });
  await flushEffects();
}

async function changeInput(element, value) {
  if (!element) throw new Error('Missing input element');
  const prototype = element.ownerDocument?.defaultView?.HTMLInputElement?.prototype;
  const valueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

  flushSync(() => {
    valueSetter?.call(element, value);
    element.dispatchEvent(new window.Event('input', { bubbles: true }));
    element.dispatchEvent(new window.Event('change', { bubbles: true }));
  });

  await flushEffects();

  await flushEffects();
}

async function waitForElement(getElement, attempts = 40) {
  for (let index = 0; index < attempts; index += 1) {
    const element = getElement();
    if (element) return element;
    await flushEffects();
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  return null;
}

function findByText(container, text) {
  return (
    Array.from(container.querySelectorAll('*')).find((element) => element.textContent === text) ||
    null
  );
}

function queryLatexSurface(container) {
  return (
    container.querySelector('[data-testid="latex-preview"]') ||
    container.querySelector('[data-testid="latex-document-preview"]') ||
    container.querySelector('[data-testid="latex-document-preview-loading"]') ||
    container.querySelector('[data-testid="latex-document-preview-error"]')
  );
}

describe('FileExplorerEditorPane', () => {
  let dom;
  const originalFetch = global.fetch;

  beforeEach(() => {
    dom = installDom();
    window.localStorage.clear();

    global.fetch = jest.fn((url, init) => {
      const href = String(url);

      if (href.startsWith('/api/fs/git-status')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            repoRoot: '/workspace/devhub',
            changedFiles: [
              {
                path: 'src/components/TerminalDock.jsx',
                indexStatus: ' ',
                worktreeStatus: 'M',
                untracked: false,
                unstaged: true,
              },
              {
                path: 'README.md',
                indexStatus: ' ',
                worktreeStatus: 'M',
                untracked: false,
                unstaged: true,
              },
            ],
            updatedAt: 1,
          }),
        });
      }

      if (href.startsWith('/api/fs/git-diff')) {
        const url = new URL(href, 'https://devhub.test');
        const filePath = url.searchParams.get('path') || '';
        return Promise.resolve({
          ok: true,
          json: async () => ({
            path: filePath,
            binary: false,
            tooLarge: false,
            original: '// original\n',
            modified: filePath.endsWith('.jsx')
              ? 'export default function TerminalDock() { return null; }'
              : '# Hola mundo',
          }),
        });
      }

      if (href.startsWith('/api/fs/tree/batch') || href === '/api/fs/tree/batch') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            listings: {
              '': [
                { name: 'paper.tex', path: 'paper.tex', type: 'file' },
                { name: 'README.md', path: 'README.md', type: 'file' },
                { name: 'src', path: 'src', type: 'directory', children: null },
              ],
              src: [
                {
                  name: 'components',
                  path: 'src/components',
                  type: 'directory',
                  children: null,
                },
              ],
              'src/components': [
                {
                  name: 'TerminalDock.jsx',
                  path: 'src/components/TerminalDock.jsx',
                  type: 'file',
                },
              ],
            },
          }),
        });
      }

      if (href.startsWith('/api/fs/watch')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ ok: true }),
        });
      }

      if (href.startsWith('/api/fs/search')) {
        const parsed = new URL(href, 'https://devhub.test');
        const query = (parsed.searchParams.get('q') || '').toLowerCase();
        if (query.includes('missing')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ hits: [], truncated: false }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({
            hits: [
              {
                path: 'src/components/TerminalDock.jsx',
                rel: 'src/components/TerminalDock.jsx',
                name: 'TerminalDock.jsx',
                is_dir: false,
              },
            ],
            truncated: false,
          }),
        });
      }

      if (href.startsWith('/api/fs/tree')) {
        const parsed = new URL(href, 'https://devhub.test');
        const dir = parsed.searchParams.get('dir') || '';

        if (dir === 'src') {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              mode: 'shallow',
              tree: [
                {
                  name: 'components',
                  path: 'src/components',
                  type: 'directory',
                  children: null,
                },
              ],
            }),
          });
        }

        if (dir === 'src/components') {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              mode: 'shallow',
              tree: [
                {
                  name: 'TerminalDock.jsx',
                  path: 'src/components/TerminalDock.jsx',
                  type: 'file',
                },
              ],
            }),
          });
        }

        return Promise.resolve({
          ok: true,
          json: async () => ({
            mode: 'shallow',
            tree: [
              { name: 'paper.tex', path: 'paper.tex', type: 'file' },
              { name: 'README.md', path: 'README.md', type: 'file' },
              {
                name: 'src',
                path: 'src',
                type: 'directory',
                children: null,
              },
            ],
          }),
        });
      }

      if (String(url).startsWith('/api/fs/read?path=paper.tex')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            content: '\\section{Hola}\\nEsta es una vista previa.',
          }),
        });
      }

      if (String(url).startsWith('/api/fs/read?path=README.md')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            content: '# Hola mundo',
          }),
        });
      }

      if (String(url).startsWith('/api/fs/read?path=src%2Fcomponents%2FTerminalDock.jsx')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            content: 'export default function TerminalDock() { return null; }',
          }),
        });
      }

      return Promise.resolve({
        ok: false,
        json: async () => ({ error: 'Unexpected fetch in test' }),
      });
    });
  });

  afterEach(() => {
    while (mountedRoots.length > 0) {
      const { root, container } = mountedRoots.pop();
      flushSync(() => {
        root.unmount();
      });
      container.remove();
    }

    dom.window.close();
    delete global.localStorage;
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  test('renders LaTeX files in preview mode and lets the user switch back to raw source', async () => {
    const view = await renderIntoDom(
      React.createElement(FileExplorerEditorPane, {
        project: { id: 'project-1', local_path: '/workspace/devhub' },
      })
    );

    const latexNode = await waitForElement(() =>
      view.container.querySelector('[data-path="paper.tex"]')
    );
    await click(latexNode);
    await waitForElement(() => queryLatexSurface(view.container));

    expect(queryLatexSurface(view.container)).not.toBeNull();
    expect(view.container.querySelector('[data-testid="monaco-editor"]')).toBeNull();
    expect(view.container.textContent).toContain('paper.tex');
    expect(view.container.textContent).toContain('Preview');
    expect(view.container.textContent).toContain('Raw');

    await click(findByText(view.container, 'Raw'));
    expect(view.container.querySelector('[data-testid="latex-preview"]')).toBeNull();
    expect(view.container.querySelector('[data-testid="monaco-editor"]')?.textContent).toContain(
      'latex::\\section{Hola}\\nEsta es una vista previa.'
    );

    await click(findByText(view.container, 'Preview'));
    expect(queryLatexSurface(view.container)).not.toBeNull();
  });

  test('can fully collapse and restore the file tree sidebar', async () => {
    const view = await renderIntoDom(
      React.createElement(FileExplorerEditorPane, {
        project: { id: 'project-2', local_path: '/workspace/devhub' },
      })
    );

    await waitForElement(() => view.container.querySelector('[data-path="paper.tex"]'));
    expect(findByText(view.container, 'paper.tex')).not.toBeNull();

    await click(view.container.querySelector('[data-testid="editor-tree-toggle"]'));
    expect(findByText(view.container, 'paper.tex')).toBeNull();

    const collapsedPrefs = JSON.parse(window.localStorage.getItem('devhub_ui_prefs_project-2'));
    expect(collapsedPrefs.editorFileTreeCollapsed).toBe(true);

    await click(view.container.querySelector('[data-testid="editor-tree-toggle"]'));
    await waitForElement(() => view.container.querySelector('[data-path="paper.tex"]'));
    expect(findByText(view.container, 'paper.tex')).not.toBeNull();

    const expandedPrefs = JSON.parse(window.localStorage.getItem('devhub_ui_prefs_project-2'));
    expect(expandedPrefs.editorFileTreeCollapsed).toBe(false);
  });

  test('searches via /api/fs/search and opens nested matches', async () => {
    const view = await renderIntoDom(
      React.createElement(FileExplorerEditorPane, {
        project: { id: 'project-3', local_path: '/workspace/devhub' },
        workspaceId: 'ws1',
      })
    );

    await waitForElement(() => view.container.querySelector('[data-path="README.md"]'));

    await changeInput(
      view.container.querySelector('[data-testid="editor-tree-search-input"]'),
      'terminaldock'
    );

    await waitForElement(() =>
      view.container.querySelector('[data-path="src/components/TerminalDock.jsx"]')
    );

    expect(view.container.textContent).toContain('TerminalDock.jsx');
    expect(view.container.textContent).not.toContain('README.md');
    expect(
      global.fetch.mock.calls.filter(([url]) => String(url).startsWith('/api/fs/search'))
    ).not.toHaveLength(0);

    await click(view.container.querySelector('[data-path="src/components/TerminalDock.jsx"]'));
    expect(view.container.querySelector('[data-testid="monaco-editor"]')?.textContent).toContain(
      'TerminalDock'
    );
    expect(view.container.querySelector('[data-testid="editor-current-file"]')).toBeNull();
  });

  test('keeps a compact refresh action without a Workspace files title', async () => {
    const view = await renderIntoDom(
      React.createElement(FileExplorerEditorPane, {
        project: { id: 'project-5', local_path: '/workspace/devhub' },
        workspaceId: 'ws1',
      })
    );

    await waitForElement(() => view.container.querySelector('[data-path="README.md"]'));

    expect(view.container.textContent).not.toContain('Workspace files');
    expect(view.container.querySelector('[data-testid="editor-pane-title"]')).toBeNull();
    expect(view.container.querySelector('[data-testid="editor-pane-subtitle"]')).toBeNull();
    expect(view.container.querySelector('[data-testid="editor-current-directory"]')).toBeNull();
    expect(view.container.querySelector('[data-testid="editor-current-file"]')).toBeNull();
    expect(
      view.container.querySelector('[aria-label="Recargar árbol de archivos"]')
    ).not.toBeNull();
  });

  test('embedded mode omits the top chrome strip entirely', async () => {
    const view = await renderIntoDom(
      React.createElement(FileExplorerEditorPane, {
        project: { id: 'project-5', local_path: '/workspace/devhub' },
        workspaceId: 'ws1',
        embedded: true,
      })
    );

    await waitForElement(() => view.container.querySelector('[data-path="README.md"]'));

    expect(view.container.textContent).not.toContain('Workspace files');
    expect(view.container.querySelector('[data-testid="editor-pane-refresh"]')).toBeNull();
  });

  test('expands folders on row click and shows an empty-search message when nothing matches', async () => {
    const view = await renderIntoDom(
      React.createElement(FileExplorerEditorPane, {
        project: { id: 'project-4', local_path: '/workspace/devhub' },
        workspaceId: 'ws1',
      })
    );

    await waitForElement(() => view.container.querySelector('[data-path="README.md"]'));

    const srcRow = view.container.querySelector('[data-path="src"]');
    expect(srcRow).not.toBeNull();
    await click(srcRow);
    await waitForElement(() => view.container.querySelector('[data-path="src/components"]'));

    await changeInput(
      view.container.querySelector('[data-testid="editor-tree-search-input"]'),
      'missing-file'
    );

    await waitForElement(() =>
      view.container.querySelector('[data-testid="editor-tree-empty-search"]')
    );

    expect(view.container.querySelector('[data-testid="editor-tree-empty-search"]')).not.toBeNull();
    expect(view.container.textContent).toContain('missing-file');
  });

  test('keeps tree and preview regions locally scroll-contained', async () => {
    const view = await renderIntoDom(
      React.createElement(FileExplorerEditorPane, {
        project: { id: 'project-scroll', local_path: '/workspace/devhub' },
      })
    );

    await waitForElement(() => view.container.querySelector('[data-path="README.md"]'));

    const pane = view.container.querySelector('[data-testid="shared-editor-pane"]');
    expect(pane.classList.contains('overflow-hidden')).toBe(true);

    const treePanel = view.container.querySelector('[data-testid="editor-tree-panel"]');
    expect(treePanel.classList.contains('overflow-hidden')).toBe(true);

    const treeScroll = view.container.querySelector('[data-testid="editor-tree-scroll-region"]');
    expect(treeScroll.classList.contains('overscroll-contain')).toBe(true);
    expect(treeScroll.classList.contains('overflow-y-auto')).toBe(true);
    expect(treeScroll.classList.contains('min-h-0')).toBe(true);
    expect(treeScroll.style.touchAction).toBe('pan-y');

    const readmeNode = await waitForElement(() =>
      view.container.querySelector('[data-path="README.md"]')
    );
    await click(readmeNode);

    const previewScroll = await waitForElement(() =>
      view.container.querySelector('[data-testid="editor-preview-scroll-region"]')
    );
    expect(previewScroll.classList.contains('overscroll-contain')).toBe(true);
  });

  test('embedded mode uses a fixed pixel tree split instead of nested percent panels', async () => {
    const view = await renderIntoDom(
      React.createElement(FileExplorerEditorPane, {
        project: { id: 'project-embedded-split', local_path: '/workspace/devhub' },
        workspaceId: 'ws-embedded-split',
        embedded: true,
      })
    );

    await waitForElement(() => view.container.querySelector('[data-path="README.md"]'));

    expect(view.container.querySelector('[data-testid="embedded-editor-split"]')).not.toBeNull();
    expect(
      view.container.querySelector('[data-testid="embedded-tree-resize-handle"]')
    ).not.toBeNull();
    expect(view.container.querySelector('[data-testid="mock-handle"]')).toBeNull();

    const treePanel = view.container.querySelector('[data-testid="editor-tree-panel"]');
    expect(treePanel.style.width).toBe('220px');
    expect(treePanel.style.maxWidth).toBe('300px');
    expect(treePanel.style.minWidth).toBe('160px');
  });

  test('embedded markdown preview exposes a horizontal document rail for narrow docks', async () => {
    const view = await renderIntoDom(
      React.createElement(FileExplorerEditorPane, {
        project: { id: 'project-embedded-preview', local_path: '/workspace/devhub' },
        workspaceId: 'ws-embedded-preview',
        embedded: true,
      })
    );

    const readmeNode = await waitForElement(() =>
      view.container.querySelector('[data-path="README.md"]')
    );
    await click(readmeNode);

    const previewScroll = await waitForElement(() =>
      view.container.querySelector('[data-testid="editor-preview-scroll-region"]')
    );
    const rail = await waitForElement(() =>
      view.container.querySelector('[data-testid="editor-document-preview-rail"]')
    );
    const horizontalScrollbar = await waitForElement(() =>
      view.container.querySelector('[data-testid="editor-preview-horizontal-scrollbar"]')
    );
    const scrollbarSpacer = horizontalScrollbar.firstElementChild;
    const markdownShell = view.container.querySelector('.filesystem-markdown-shell--embedded');
    const markdownPreview = view.container.querySelector('.filesystem-markdown-preview--embedded');

    expect(previewScroll.classList.contains('overflow-x-auto')).toBe(true);
    expect(rail.classList.contains('filesystem-document-surface--embedded')).toBe(true);
    expect(horizontalScrollbar).not.toBeNull();
    expect(scrollbarSpacer).not.toBeNull();
    expect(markdownShell).not.toBeNull();
    expect(markdownPreview).not.toBeNull();
    expect(rail.style.minWidth).toBe(scrollbarSpacer.style.minWidth);

    Object.defineProperty(previewScroll, 'clientWidth', {
      configurable: true,
      value: 320,
    });
    Object.defineProperty(previewScroll, 'scrollWidth', {
      configurable: true,
      value: 960,
    });
    Object.defineProperty(horizontalScrollbar, 'clientWidth', {
      configurable: true,
      value: 240,
    });
    Object.defineProperty(horizontalScrollbar, 'scrollWidth', {
      configurable: true,
      value: 720,
    });

    flushSync(() => {
      previewScroll.scrollLeft = 160;
      previewScroll.dispatchEvent(new window.Event('scroll', { bubbles: true }));
    });

    expect(horizontalScrollbar.scrollLeft).toBe(120);

    flushSync(() => {
      horizontalScrollbar.scrollLeft = 240;
      horizontalScrollbar.dispatchEvent(new window.Event('scroll', { bubbles: true }));
    });

    expect(previewScroll.scrollLeft).toBe(320);

    flushSync(() => {
      horizontalScrollbar.dispatchEvent(
        new window.WheelEvent('wheel', {
          bubbles: true,
          cancelable: true,
          deltaY: 48,
        })
      );
    });

    expect(horizontalScrollbar.scrollLeft).toBe(288);
    expect(previewScroll.scrollLeft).toBe(384);
  });

  test('uses an empty state before any file is selected and avoids mounting monaco eagerly', async () => {
    const view = await renderIntoDom(
      React.createElement(FileExplorerEditorPane, {
        project: { id: 'project-empty', local_path: '/workspace/devhub' },
      })
    );

    await waitForElement(() => view.container.querySelector('[data-testid="editor-empty-state"]'));

    expect(view.container.querySelector('[data-testid="editor-empty-state"]')).not.toBeNull();
    expect(view.container.textContent).toContain('Select a file to start browsing');

    expect(view.container.querySelector('[data-testid="monaco-editor"]')).toBeNull();
  });

  test('keeps a real h-full height contract in standalone mode', async () => {
    const view = await renderIntoDom(
      React.createElement(FileExplorerEditorPane, {
        project: { id: 'project-height', local_path: '/workspace/devhub' },
      })
    );

    const pane = view.container.querySelector('[data-testid="shared-editor-pane"]');
    expect(pane.classList.contains('h-full')).toBe(true);
    expect(pane.classList.contains('w-full')).toBe(true);
  });

  test('opens code files from Changes as Diff; markdown keeps document preview', async () => {
    const view = await renderIntoDom(
      React.createElement(FileExplorerEditorPane, {
        project: { id: 'project-diff', local_path: '/workspace/devhub' },
      })
    );

    await waitForElement(() =>
      view.container.querySelector('[data-testid="explorer-tab-changes"]')
    );
    await click(view.container.querySelector('[data-testid="explorer-tab-changes"]'));
    await waitForElement(() =>
      view.container.querySelector('[data-testid="source-control-panel"]')
    );

    const jsRow = Array.from(view.container.querySelectorAll('[data-testid="sc-file-open"]')).find(
      (el) =>
        el.getAttribute('title') === 'src/components/TerminalDock.jsx' ||
        el.textContent.includes('TerminalDock.jsx')
    );
    expect(jsRow).toBeTruthy();
    await click(jsRow);
    await waitForElement(() => view.container.querySelector('[data-testid="git-diff-view"]'));
    expect(view.container.querySelector('[data-testid="monaco-diff-editor"]')).not.toBeNull();
    expect(
      view.container.querySelector('[data-testid="editor-code-surface-toggle"]')
    ).not.toBeNull();

    await click(view.container.querySelector('[data-testid="explorer-tab-files"]'));
    const readme = await waitForElement(() =>
      view.container.querySelector('[data-path="README.md"]')
    );
    await click(readme);
    await waitForElement(() => view.container.querySelector('[data-testid="markdown-preview"]'));
    expect(view.container.querySelector('[data-testid="markdown-preview"]')).not.toBeNull();
    expect(view.container.querySelector('[data-testid="git-diff-view"]')).toBeNull();
    expect(
      view.container.querySelector('[data-testid="editor-document-view-toggle"]')
    ).not.toBeNull();
    expect(view.container.querySelector('[data-testid="editor-code-surface-toggle"]')).toBeNull();
  });
});
