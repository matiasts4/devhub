/**
 * WebglErrorSection — visible error UI when xterm-webgl fails.
 *
 * Contract:
 * - Renders a contained section (testid `terminal-webgl-error-section`)
 *   with Spanish copy from getTerminalRendererWebglFallbackCopy.
 * - Shows the specific reason code in a monospace line.
 * - Offers "Switch to xterm (DOM)" and "Retry probe" buttons when their
 *   respective handlers are provided.
 * - Clicking each button fires its handler exactly once.
 */

const React = require('react');
const { createRoot } = require('react-dom/client');
const { flushSync } = require('react-dom');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://devhub.test',
});

global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;
global.HTMLElement = dom.window.HTMLElement;
global.Node = dom.window.Node;
global.MouseEvent = dom.window.MouseEvent;
global.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
global.cancelAnimationFrame = (id) => clearTimeout(id);

jest.mock('lucide-react', () => ({
  __esModule: true,
  AlertTriangle: () => null,
  RefreshCw: () => null,
  Terminal: () => null,
}));

const WebglErrorSection = require('../WebglErrorSection.jsx').default;
const {
  getTerminalRendererWebglFallbackCopy,
  TERMINAL_WEBGL_FALLBACK_REASONS,
} = require('@/components/terminal/terminalRendererCapabilities');

function renderIntoDocument(element) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  flushSync(() => {
    root.render(element);
  });
  return { container, root };
}

describe('WebglErrorSection', () => {
  test('renders the contained error section with the reason code and Spanish copy', () => {
    const reason = TERMINAL_WEBGL_FALLBACK_REASONS.WEBGL_CONTEXT_CREATION_FAILED;
    const { container } = renderIntoDocument(
      React.createElement(WebglErrorSection, {
        id: 'term-webgl-err-1',
        reason,
        onSwitchToXterm: jest.fn(),
        onRetry: jest.fn(),
      })
    );

    const section = container.querySelector('[data-testid="terminal-webgl-error-section"]');
    expect(section).not.toBeNull();
    expect(section.getAttribute('role')).toBe('alert');
    expect(section.textContent).toContain(`code: ${reason}`);
    expect(section.textContent).toContain(getTerminalRendererWebglFallbackCopy(reason));
  });

  test('uses the element id derived from the id prop for unique anchoring', () => {
    const { container } = renderIntoDocument(
      React.createElement(WebglErrorSection, {
        id: 'term-webgl-err-2',
        reason: TERMINAL_WEBGL_FALLBACK_REASONS.WEBGL_UNSUPPORTED_IN_WEBVIEW,
      })
    );
    const section = container.querySelector('#terminal-webgl-error-section-term-webgl-err-2');
    expect(section).not.toBeNull();
  });

  test('renders a generic hint and reason text when the reason is unknown', () => {
    const { container } = renderIntoDocument(
      React.createElement(WebglErrorSection, {
        reason: 'some-future-reason-not-in-the-map',
      })
    );
    const section = container.querySelector('[data-testid="terminal-webgl-error-section"]');
    expect(section).not.toBeNull();
    expect(section.textContent).toContain('code: some-future-reason-not-in-the-map');
    expect(section.textContent).toContain(
      getTerminalRendererWebglFallbackCopy('some-future-reason-not-in-the-map')
    );
  });

  test('clicking "Switch to xterm (DOM)" calls onSwitchToXterm and not onRetry', () => {
    const onSwitchToXterm = jest.fn();
    const onRetry = jest.fn();
    const { container } = renderIntoDocument(
      React.createElement(WebglErrorSection, {
        id: 'term-webgl-err-3',
        reason: TERMINAL_WEBGL_FALLBACK_REASONS.WEBGL_CONTEXT_LOST,
        onSwitchToXterm,
        onRetry,
      })
    );

    const button = container.querySelector('[data-testid="terminal-webgl-error-switch-xterm"]');
    expect(button).not.toBeNull();
    button.click();
    expect(onSwitchToXterm).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
  });

  test('clicking "Retry probe" calls onRetry and not onSwitchToXterm', () => {
    const onSwitchToXterm = jest.fn();
    const onRetry = jest.fn();
    const { container } = renderIntoDocument(
      React.createElement(WebglErrorSection, {
        id: 'term-webgl-err-4',
        reason: TERMINAL_WEBGL_FALLBACK_REASONS.WEBGL_ADDON_REGISTER_FAILED,
        onSwitchToXterm,
        onRetry,
      })
    );

    const button = container.querySelector('[data-testid="terminal-webgl-error-retry"]');
    expect(button).not.toBeNull();
    button.click();
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onSwitchToXterm).not.toHaveBeenCalled();
  });

  test('omits the action buttons when their handlers are not provided', () => {
    const { container } = renderIntoDocument(
      React.createElement(WebglErrorSection, {
        id: 'term-webgl-err-5',
        reason: TERMINAL_WEBGL_FALLBACK_REASONS.WEBGL_TEXTURE_ALLOC_FAILED,
      })
    );
    expect(container.querySelector('[data-testid="terminal-webgl-error-switch-xterm"]')).toBeNull();
    expect(container.querySelector('[data-testid="terminal-webgl-error-retry"]')).toBeNull();
  });
});
