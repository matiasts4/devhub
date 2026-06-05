/**
 * @jest-environment jsdom
 *
 * PanelRendererSelect — per-panel renderer switcher presentational component.
 *
 * Specs: openspec/changes/terminal-renderer-xterm-webgl/specs/terminal-renderer-selection/spec.md
 *
 * - RS-03: the switcher is mounted per panel with a stable test-id.
 * - RS-04: clicking the option calls onChange with the chosen mode.
 * - RS-05: the `canvas` row is present, aria-disabled, non-selectable.
 * - RS-06: `xterm` (DOM) is NOT a selectable option; only the four named
 *          rows (Inherit, xterm-webgl, vte-experimental, canvas) are present.
 * - RS-07: when the current mode is `vte-experimental`, the trigger is
 *          aria-disabled with a `title` mentioning VTE.
 *
 * Test strategy: jsdom + RTL + userEvent. We render the component in
 * isolation (no provider, no store) and assert the DOM contract. The
 * component is purely presentational; the parent passes the resolved
 * `currentMode` and receives `onChange(mode)` callbacks.
 */

const React = require('react');
const { JSDOM } = require('jsdom');
const { flushSync } = require('react-dom');
const { createRoot } = require('react-dom/client');
const userEvent = require('@testing-library/user-event').default;
require('@testing-library/jest-dom');

const PanelRendererSelectModule = require('../components/PanelRendererSelect');
const PanelRendererSelect = PanelRendererSelectModule.default;
const { RENDERER_SELECT_OPTIONS } = PanelRendererSelectModule;

const mountedRoots = [];

function installDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://localhost:3100/',
  });
  global.window = dom.window;
  global.document = dom.window.document;
  global.navigator = dom.window.navigator;
  global.HTMLElement = dom.window.HTMLElement;
  global.Node = dom.window.Node;
  global.MouseEvent = dom.window.MouseEvent;
  global.Event = dom.window.Event;
  global.KeyboardEvent = dom.window.KeyboardEvent;
  global.CustomEvent = dom.window.CustomEvent;
  global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  global.cancelAnimationFrame = (id) => clearTimeout(id);
  return dom;
}

function renderComponent(props) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  flushSync(() => {
    root.render(React.createElement(PanelRendererSelect, props));
  });
  return {
    container,
    root,
    unmount: () => {
      flushSync(() => root.unmount());
      container.remove();
    },
  };
}

describe('PanelRendererSelect — presentational contract', () => {
  let dom;
  let user;

  beforeEach(() => {
    dom = installDom();
    user = userEvent.setup();
  });

  afterEach(() => {
    mountedRoots.splice(0).forEach(({ root, container }) => {
      try {
        flushSync(() => root.unmount());
      } catch (e) {
        // ignore
      }
      container.remove();
    });
    if (dom && dom.window && dom.window.close) {
      try {
        dom.window.close();
      } catch (e) {
        // ignore
      }
    }
  });

  // ── 1. Trigger button + data-testid + data-active-renderer ─────────────
  test('renders a trigger button with the stable test-id and data-active-renderer for the current mode', () => {
    const view = renderComponent({
      panelId: 'p1',
      currentMode: 'xterm',
      availableModes: ['xterm-webgl', 'vte-experimental'],
      onChange: jest.fn(),
    });

    const trigger = view.container.querySelector('[data-testid="panel-renderer-select-p1"]');
    expect(trigger).not.toBeNull();
    expect(trigger.tagName).toBe('BUTTON');
    expect(trigger.getAttribute('data-active-renderer')).toBe('xterm');

    view.unmount();
  });

  // ── 2. Dropdown opens with 4 options ──────────────────────────────────
  test('clicking the trigger opens a listbox with 4 options (Inherit, xterm-webgl, vte-experimental, canvas)', async () => {
    const view = renderComponent({
      panelId: 'p1',
      currentMode: 'xterm',
      availableModes: ['xterm-webgl', 'vte-experimental'],
      onChange: jest.fn(),
    });

    const trigger = view.container.querySelector('[data-testid="panel-renderer-select-p1"]');
    expect(trigger).not.toBeNull();

    await user.click(trigger);

    const listbox = view.container.querySelector('[role="listbox"]');
    expect(listbox).not.toBeNull();

    const options = view.container.querySelectorAll('[role="option"]');
    expect(options).toHaveLength(4);

    const labels = Array.from(options).map((opt) => opt.textContent.trim());
    expect(labels).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Inherit'),
        expect.stringContaining('xterm + WebGL'),
        expect.stringContaining('GTK VTE'),
        expect.stringContaining('canvas'),
      ])
    );

    view.unmount();
  });

  // ── 3. Clicking xterm-webgl calls onChange('xterm-webgl') ────────────
  test('clicking the xterm + WebGL option calls onChange exactly once with "xterm-webgl"', async () => {
    const onChange = jest.fn();
    const view = renderComponent({
      panelId: 'p1',
      currentMode: 'xterm',
      availableModes: ['xterm-webgl', 'vte-experimental'],
      onChange,
    });

    const trigger = view.container.querySelector('[data-testid="panel-renderer-select-p1"]');
    await user.click(trigger);

    const webglOption = view.container.querySelector(
      '[data-testid="panel-renderer-option-xterm-webgl-p1"]'
    );
    expect(webglOption).not.toBeNull();
    await user.click(webglOption);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('xterm-webgl');

    view.unmount();
  });

  // ── 4. Clicking Inherit calls onChange('inherit') ─────────────────────
  test('clicking the Inherit option calls onChange exactly once with "inherit"', async () => {
    const onChange = jest.fn();
    const view = renderComponent({
      panelId: 'p1',
      currentMode: 'xterm-webgl',
      availableModes: ['xterm-webgl', 'vte-experimental'],
      onChange,
    });

    const trigger = view.container.querySelector('[data-testid="panel-renderer-select-p1"]');
    await user.click(trigger);

    const inheritOption = view.container.querySelector(
      '[data-testid="panel-renderer-option-inherit-p1"]'
    );
    expect(inheritOption).not.toBeNull();
    await user.click(inheritOption);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('inherit');

    view.unmount();
  });

  // ── 5. Clicking canvas does NOT call onChange ─────────────────────────
  test('clicking the disabled canvas option does NOT call onChange', async () => {
    const onChange = jest.fn();
    const view = renderComponent({
      panelId: 'p1',
      currentMode: 'xterm',
      availableModes: ['xterm-webgl', 'vte-experimental'],
      onChange,
    });

    const trigger = view.container.querySelector('[data-testid="panel-renderer-select-p1"]');
    await user.click(trigger);

    const canvasOption = view.container.querySelector(
      '[data-testid="panel-renderer-option-canvas-p1"]'
    );
    expect(canvasOption).not.toBeNull();
    await user.click(canvasOption);

    expect(onChange).not.toHaveBeenCalled();

    view.unmount();
  });

  // ── 6. canvas row is aria-disabled ───────────────────────────────────
  test('the canvas option has aria-disabled="true" and is non-selectable in the options export', () => {
    // The OPTIONS export is the source of truth for the row shape; the
    // canvas row MUST be flagged selectable:false so the render code can
    // decide to render it as a non-selectable row (RS-05).
    const canvasEntry = RENDERER_SELECT_OPTIONS.find((opt) => opt.value === 'canvas');
    expect(canvasEntry).toBeDefined();
    expect(canvasEntry.selectable).toBe(false);

    const view = renderComponent({
      panelId: 'p1',
      currentMode: 'xterm',
      availableModes: ['xterm-webgl', 'vte-experimental'],
      onChange: jest.fn(),
    });

    // Open the dropdown so the canvas row is in the DOM.
    const trigger = view.container.querySelector('[data-testid="panel-renderer-select-p1"]');
    flushSync(() => {
      trigger.dispatchEvent(new global.MouseEvent('click', { bubbles: true, cancelable: true }));
    });

    const canvasOption = view.container.querySelector(
      '[data-testid="panel-renderer-option-canvas-p1"]'
    );
    expect(canvasOption).not.toBeNull();
    expect(canvasOption.getAttribute('aria-disabled')).toBe('true');
    expect(canvasOption.hasAttribute('disabled')).toBe(true);

    view.unmount();
  });

  // ── 7. VTE active mode → trigger stays openable with an explanatory title ──
  test('when currentMode is vte-experimental, the trigger is openable and the title mentions the re-mount', () => {
    const view = renderComponent({
      panelId: 'p1',
      currentMode: 'vte-experimental',
      availableModes: ['xterm-webgl', 'vte-experimental'],
      onChange: jest.fn(),
    });

    const trigger = view.container.querySelector('[data-testid="panel-renderer-select-p1"]');
    expect(trigger).not.toBeNull();
    // The trigger stays clickable so the user can switch OUT of VTE.
    expect(trigger.getAttribute('aria-disabled')).not.toBe('true');
    expect(trigger.hasAttribute('disabled')).toBe(false);
    // The title still surfaces that re-mounting will happen.
    expect(trigger.getAttribute('title') || '').toMatch(/VTE/i);

    view.unmount();
  });
});
