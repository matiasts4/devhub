const React = require('react');
const { createRoot } = require('react-dom/client');
const { flushSync } = require('react-dom');
const { JSDOM } = require('jsdom');

let capturedWorkspacePaneProps = null;

jest.mock('lucide-react', () => {
  const icon = (name) => (props) => {
    const R = require('react');
    return R.createElement('svg', { ...props, 'data-icon': name });
  };
  return new Proxy({}, { get: (_, key) => icon(String(key)) });
});

jest.mock('@/components/workspace/WorkspaceBrowserPane', () => ({
  __esModule: true,
  default: (props) => {
    const React = require('react');
    capturedWorkspacePaneProps = props;
    return React.createElement('div', { 'data-testid': 'mock-workspace-browser-pane' });
  },
}));

describe('PizarraBrowserSurface', () => {
  let container;
  let root;

  beforeEach(() => {
    capturedWorkspacePaneProps = null;
    jest.clearAllMocks();

    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
      url: 'http://localhost:3100/',
    });
    global.document = dom.window.document;
    global.window = dom.window;
    global.requestAnimationFrame = (callback) => setTimeout(callback, 0);
    global.cancelAnimationFrame = (timerId) => clearTimeout(timerId);

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    flushSync(() => root.unmount());
    root = null;
    container = null;
    delete global.requestAnimationFrame;
    delete global.cancelAnimationFrame;
  });

  test('reuses WorkspaceBrowserPane and keeps a dedicated drag handle for pizarra movement', async () => {
    const onMove = jest.fn();
    const onSelect = jest.fn();
    const onUpdateElement = jest.fn();
    const { default: PizarraBrowserSurface } = require('../PizarraBrowserSurface');

    flushSync(() => {
      root.render(
        React.createElement(PizarraBrowserSurface, {
          shape: {
            id: 'browser-1',
            label: 'Browser',
            url: 'http://localhost:3200/',
          },
          bounds: { x: 20, y: 40, width: 400, height: 320 },
          onSelect,
          onMove,
          onUpdateElement,
        })
      );
    });

    expect(capturedWorkspacePaneProps).toBeTruthy();
    expect(capturedWorkspacePaneProps.projectId).toBe('pizarra');
    expect(capturedWorkspacePaneProps.workspaceId).toBe('browser-1');
    expect(capturedWorkspacePaneProps.layoutSyncKey).toBe('20:40:400:320:20:40');
    expect(capturedWorkspacePaneProps.dockState.browserUrl).toBe('http://localhost:3100/');

    const header = document.querySelector('[data-testid="pizarra-browser-drag-handle-browser-1"]');
    flushSync(() => {
      header.dispatchEvent(
        new window.MouseEvent('mousedown', {
          bubbles: true,
          button: 0,
          clientX: 12,
          clientY: 16,
        })
      );
    });
    flushSync(() => {
      window.dispatchEvent(
        new window.MouseEvent('mousemove', {
          bubbles: true,
          clientX: 27,
          clientY: 36,
        })
      );
    });
    flushSync(() => {
      window.dispatchEvent(new window.MouseEvent('mouseup', { bubbles: true }));
    });

    flushSync(() => {
      capturedWorkspacePaneProps.onDockStateChange((currentState) => ({
        ...currentState,
        browserUrl: 'https://example.com',
      }));
    });

    expect(onSelect).toHaveBeenCalledWith('browser-1');
    expect(onMove).toHaveBeenCalledWith({
      id: 'browser-1',
      panelId: 'pizarra-browser-browser-1',
      deltaX: 15,
      deltaY: 20,
      totalDeltaX: 15,
      totalDeltaY: 20,
    });
    expect(onUpdateElement).toHaveBeenCalledWith('browser-1', { url: 'https://example.com' });
  });
});
