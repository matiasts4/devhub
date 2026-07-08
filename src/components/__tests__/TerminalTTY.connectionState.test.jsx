/**
 * Regression: controlled connectionState must not freeze setConnectionState.
 * After parent stored "connecting", further setConnectionState('connected')
 * used to be a no-op → permanent "Conectando…" on host switches.
 */
'use strict';

const React = require('react');
const { act } = require('react');
const { createRoot } = require('react-dom/client');
const { installDom, flushEffects } = require('@/test-support/domHarness');

// Lightweight surface: import only the connection-state logic by reading the
// module contract via a thin harness component isn't practical; instead we
// unit-test the intended setState+notify pattern that TerminalTTY now uses.

describe('TerminalTTY connection state contract (controlled parent)', () => {
  let dom;

  beforeEach(() => {
    dom = installDom();
  });

  afterEach(() => {
    dom?.window?.close?.();
  });

  test('notifying parent of connecting then connected does not freeze at connecting', async () => {
    const parentStates = [];
    let setInternal;
    let getDisplayed;

    function Harness() {
      const [internal, setI] = React.useState('idle');
      const [external, setExternal] = React.useState(undefined);
      setInternal = (next) => {
        setI((prev) => {
          const value = typeof next === 'function' ? next(prev) : next;
          if (value && value !== prev) {
            queueMicrotask(() => {
              parentStates.push(value);
              setExternal(value);
            });
          }
          return value;
        });
      };
      // Mirror TerminalTTY display policy after the fix.
      const connectionState =
        external === 'suspended' && internal !== 'connecting'
          ? external
          : internal || external || 'idle';
      getDisplayed = () => connectionState;
      return React.createElement('div', { 'data-state': connectionState }, connectionState);
    }

    const container = dom.window.document.createElement('div');
    dom.window.document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(Harness));
    });
    await flushEffects();

    await act(async () => {
      setInternal('connecting');
    });
    await flushEffects();
    await act(async () => {
      await Promise.resolve();
    });

    expect(getDisplayed()).toBe('connecting');

    await act(async () => {
      setInternal('connected');
    });
    await flushEffects();
    await act(async () => {
      await Promise.resolve();
    });

    expect(parentStates).toEqual(['connecting', 'connected']);
    expect(getDisplayed()).toBe('connected');
  });
});
