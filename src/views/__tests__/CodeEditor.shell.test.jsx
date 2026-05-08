const React = require('react');
const { createRoot } = require('react-dom/client');
const { flushSync } = require('react-dom');
const { JSDOM } = require('jsdom');

const mockUseOutletContext = jest.fn();
const mockFileExplorerEditorPane = jest.fn();

jest.mock('react-router-dom', () => ({
  useOutletContext: () => mockUseOutletContext(),
}), { virtual: true });

jest.mock('@/components/workspace/FileExplorerEditorPane', () => ({
  __esModule: true,
  default: (props) => {
    const React = require('react');
    mockFileExplorerEditorPane(props);

    React.useEffect(() => {
      props.onContextChange?.({
        projectPath: props.project?.local_path,
        currentFilePath: 'src/components/TerminalDock.jsx',
        breadcrumb: ['src', 'components', 'TerminalDock.jsx'],
      });
    }, [props]);

    return React.createElement('div', { 'data-testid': 'shared-editor-pane' }, 'shared editor pane');
  },
}), { virtual: true });

jest.mock('@monaco-editor/react', () => () => {
  const React = require('react');
  return React.createElement('div', null, 'mock monaco');
});
jest.mock('react-markdown', () => ({
  __esModule: true,
  default: ({ children }) => {
    const React = require('react');
    return React.createElement('div', null, children);
  },
}));
jest.mock('remark-gfm', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('rehype-highlight', () => ({ __esModule: true, default: jest.fn(() => jest.fn()) }));
jest.mock('@/components/ui/resizable', () => ({
  ResizablePanelGroup: ({ children }) => {
    const React = require('react');
    return React.createElement('div', null, children);
  },
  ResizablePanel: ({ children }) => {
    const React = require('react');
    return React.createElement('div', null, children);
  },
  ResizableHandle: () => {
    const React = require('react');
    return React.createElement('div', null);
  },
}));
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
jest.mock('highlight.js/styles/github-dark.css', () => ({}), { virtual: true });
jest.mock('lucide-react', () => {
  const icon = (name) => (props) => {
    const React = require('react');
    return React.createElement('svg', { ...props, 'data-icon': name });
  };
  return {
    AlertTriangle: icon('AlertTriangle'),
    Braces: icon('Braces'),
    File: icon('File'),
    FileCode2: icon('FileCode2'),
    FileText: icon('FileText'),
    FileType: icon('FileType'),
    Folder: icon('Folder'),
    FolderOpen: icon('FolderOpen'),
    Loader2: icon('Loader2'),
    GitBranch: icon('GitBranch'),
    Palette: icon('Palette'),
    RefreshCw: icon('RefreshCw'),
    Shield: icon('Shield'),
  };
});

const CodeEditor = require('../CodeEditor').default;

function installDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://devhub.test',
  });

  global.window = dom.window;
  global.document = dom.window.document;
  global.navigator = dom.window.navigator;
  global.HTMLElement = dom.window.HTMLElement;
  global.Node = dom.window.Node;

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

describe('CodeEditor route shell', () => {
  let dom;
  const originalFetch = global.fetch;

  beforeEach(() => {
    dom = installDom();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ tree: [], content: '' }),
    });
    mockUseOutletContext.mockReturnValue({
      project: { id: 'project-1', name: 'DevHub', local_path: '/workspace/devhub' },
    });
    mockFileExplorerEditorPane.mockClear();
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
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  test('keeps the routed editor shell header and project badge', async () => {
    const view = await renderIntoDom(React.createElement(CodeEditor));

    expect(view.container.textContent).toContain('Editor de Código');
    expect(view.container.textContent).toContain('DevHub');
    expect(view.container.querySelector('[data-testid="shared-editor-pane"]')).not.toBeNull();
  });

  test('passes routed project context to the shared editor pane in standalone mode', async () => {
    await renderIntoDom(React.createElement(CodeEditor));

    expect(mockFileExplorerEditorPane).toHaveBeenCalledWith(
      expect.objectContaining({
        project: { id: 'project-1', name: 'DevHub', local_path: '/workspace/devhub' },
        embedded: false,
        onContextChange: expect.any(Function),
      })
    );
  });

  test('shows project path and current file context in the standalone shell header', async () => {
    const view = await renderIntoDom(React.createElement(CodeEditor));

    expect(view.container.textContent).toContain('/workspace/devhub');
    expect(view.container.querySelector('[data-testid="code-editor-current-file"]')?.textContent).toContain(
      'src/components/TerminalDock.jsx'
    );
    expect(view.container.querySelector('[data-testid="code-editor-current-breadcrumb"]')?.textContent).toContain(
      'src / components / TerminalDock.jsx'
    );
    expect(view.container.textContent).toContain('Editor de Código');
    expect(view.container.textContent).toContain('DevHub');
  });
});
