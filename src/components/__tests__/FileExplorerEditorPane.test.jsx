const React = require('react');
const { createRoot } = require('react-dom/client');
const { flushSync } = require('react-dom');
const { JSDOM } = require('jsdom');

jest.mock('@monaco-editor/react', () => ({
  __esModule: true,
  default: ({ language, value }) => {
    const React = require('react');
    return React.createElement(
      'div',
      { 'data-testid': 'monaco-editor' },
      `${language || 'plaintext'}::${value || ''}`
    );
  },
}));

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

async function waitForElement(getElement, attempts = 5) {
  for (let index = 0; index < attempts; index += 1) {
    const element = getElement();
    if (element) return element;
    await flushEffects();
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

    global.fetch = jest.fn((url) => {
      if (String(url).startsWith('/api/fs/tree')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            tree: [
              { name: 'paper.tex', path: 'paper.tex', type: 'file' },
              { name: 'README.md', path: 'README.md', type: 'file' },
              {
                name: 'src',
                path: 'src',
                type: 'directory',
                children: [
                  {
                    name: 'components',
                    path: 'src/components',
                    type: 'directory',
                    children: [
                      {
                        name: 'TerminalDock.jsx',
                        path: 'src/components/TerminalDock.jsx',
                        type: 'file',
                      },
                    ],
                  },
                ],
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
    expect(findByText(view.container, 'paper.tex')).not.toBeNull();

    const expandedPrefs = JSON.parse(window.localStorage.getItem('devhub_ui_prefs_project-2'));
    expect(expandedPrefs.editorFileTreeCollapsed).toBe(false);
  });

  test('filters the loaded tree in memory, keeps ancestor folders visible, and opens nested matches', async () => {
    const view = await renderIntoDom(
      React.createElement(FileExplorerEditorPane, {
        project: { id: 'project-3', local_path: '/workspace/devhub' },
        workspaceId: 'ws1',
      })
    );

    await waitForElement(() => view.container.querySelector('[data-path="README.md"]'));

    const treeFetchCallsBeforeSearch = global.fetch.mock.calls.filter(([url]) =>
      String(url).startsWith('/api/fs/tree')
    ).length;

    await changeInput(
      view.container.querySelector('[data-testid="editor-tree-search-input"]'),
      'terminaldock'
    );

    expect(view.container.textContent).toContain('src');
    expect(view.container.textContent).toContain('components');
    expect(view.container.textContent).toContain('TerminalDock.jsx');
    expect(view.container.textContent).not.toContain('README.md');
    expect(
      global.fetch.mock.calls.filter(([url]) => String(url).startsWith('/api/fs/tree'))
    ).toHaveLength(treeFetchCallsBeforeSearch);

    await click(view.container.querySelector('[data-path="src/components/TerminalDock.jsx"]'));
    expect(view.container.querySelector('[data-testid="monaco-editor"]')?.textContent).toContain(
      'TerminalDock'
    );
    expect(view.container.querySelector('[data-testid="editor-current-file"]')).toBeNull();
  });

  test('keeps a compact header with only title and refresh action', async () => {
    const view = await renderIntoDom(
      React.createElement(FileExplorerEditorPane, {
        project: { id: 'project-5', local_path: '/workspace/devhub' },
        workspaceId: 'ws1',
      })
    );

    await waitForElement(() => view.container.querySelector('[data-path="README.md"]'));

    expect(view.container.textContent).toContain('Workspace files');
    expect(view.container.querySelector('[data-testid="editor-pane-subtitle"]')).toBeNull();
    expect(view.container.querySelector('[data-testid="editor-current-directory"]')).toBeNull();
    expect(view.container.querySelector('[data-testid="editor-current-file"]')).toBeNull();
    expect(
      view.container.querySelector('[aria-label="Recargar árbol de archivos"]')
    ).not.toBeNull();
  });

  test('renders explicit folder toggles and shows an empty-search message when nothing matches', async () => {
    const view = await renderIntoDom(
      React.createElement(FileExplorerEditorPane, {
        project: { id: 'project-4', local_path: '/workspace/devhub' },
        workspaceId: 'ws1',
      })
    );

    await waitForElement(() => view.container.querySelector('[data-path="README.md"]'));

    const srcToggle = view.container.querySelector('[data-testid="tree-toggle-src"]');
    expect(srcToggle).not.toBeNull();
    expect(srcToggle?.getAttribute('aria-label')).toContain('src');

    await changeInput(
      view.container.querySelector('[data-testid="editor-tree-search-input"]'),
      'missing-file'
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
});
