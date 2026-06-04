// Hydration sentinel regression: the initial message's `timestamp` MUST be the
// literal string `'initial'` at first render, so server and client output agree
// (avoids the React 18 hydration mismatch warning). A useEffect replaces it
// with a real `new Date().toISOString()` value AFTER hydration.
//
// Pattern copied from `tests/unit/operational-feedback-components.test.jsx`
// (JSDOM + createRoot + flushSync, no RTL).

const React = require('react');
const { JSDOM } = require('jsdom');

let createRoot;
let flushSync;
let ChatPanel;

function installDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://devhub.test',
  });
  global.window = dom.window;
  global.document = dom.window.document;
  global.navigator = dom.window.navigator;
  global.CustomEvent = dom.window.CustomEvent;
  global.HTMLElement = dom.window.HTMLElement;
  global.Node = dom.window.Node;
  global.MouseEvent = dom.window.MouseEvent;
  return dom;
}

async function flushEffects() {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function mountSync(element) {
  // Mount without awaiting useEffect. The DOM should reflect the very first
  // render — i.e., the timestamp sentinel.
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  flushSync(() => {
    root.render(element);
  });
  // Intentionally NOT awaiting flushEffects here — we want the pre-effect
  // snapshot. Effects will fire on the next microtask.
  return { container, root };
}

async function renderIntoDom(element) {
  const mounted = mountSync(element);
  await flushEffects();
  return { ...mounted, cleanup: () => mounted.root.unmount() };
}

describe('ChatPanel — hydration safety (T-010b)', () => {
  let dom;

  beforeEach(() => {
    dom = installDom();
    ({ createRoot } = require('react-dom/client'));
    ({ flushSync } = require('react-dom'));
    ChatPanel = require('../ChatPanel').default;
  });

  afterEach(() => {
    dom.window.close();
    jest.clearAllMocks();
  });

  test('before effects run: initial message timestamp is the literal "initial" sentinel', () => {
    // First commit, before useEffect. The timestamp MUST be the literal
    // sentinel — anything else would differ between server and client and
    // cause a React 18 hydration mismatch. The formatter
    // `new Date('initial').toLocaleTimeString(...)` yields the string
    // "Invalid Date" for the sentinel value, which is what we assert on.
    const { container, root } = mountSync(React.createElement(ChatPanel));
    expect(container.textContent).toContain('Invalid Date');
    root.unmount();
  });

  test('after effects run: timestamp becomes a real ISO string (no longer "Invalid Date")', async () => {
    const { container, cleanup } = await renderIntoDom(React.createElement(ChatPanel));
    // After the useEffect commits a real ISO, the formatter returns
    // hh:mm (en-GB locale) instead of "Invalid Date".
    expect(container.textContent).not.toContain('Invalid Date');
    // Sanity: a hh:mm pattern appears in the message list.
    expect(/\b\d{2}:\d{2}\b/.test(container.textContent)).toBe(true);
    cleanup();
  });
});

describe('ChatPanel — open_terminal visual dispatch (T-024)', () => {
  let dom;
  let realFetch;
  let dispatchSpy;

  beforeEach(() => {
    dom = installDom();
    ({ createRoot } = require('react-dom/client'));
    ({ flushSync } = require('react-dom'));
    ChatPanel = require('../ChatPanel').default;
    realFetch = global.fetch;
    dispatchSpy = jest.spyOn(dom.window, 'dispatchEvent');
  });

  afterEach(() => {
    dispatchSpy.mockRestore();
    global.fetch = realFetch;
    dom.window.close();
    jest.clearAllMocks();
  });

  function findOpenTerminalEvents() {
    return dispatchSpy.mock.calls.filter(
      (call) => call[0] && call[0].type === 'devhub:zed-open-terminal'
    );
  }

  function getTextarea(container) {
    return container.querySelector('textarea');
  }

  function setTextareaValue(ta, value) {
    // React tracks `value` on HTMLTextAreaElement via its own setter, so we go
    // through the native prototype setter for the `input` event to be observed
    // by React's onChange.
    const setter = Object.getOwnPropertyDescriptor(
      dom.window.HTMLTextAreaElement.prototype,
      'value'
    ).set;
    setter.call(ta, value);
    ta.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  }

  function clickSend(container) {
    // Only the send button is rendered when not loading. The stop button
    // appears once isLoading flips true — i.e. AFTER this click. We therefore
    // grab the first enabled button we find.
    const btn = Array.from(container.querySelectorAll('button')).find((b) => !b.disabled);
    if (!btn) throw new Error('enabled send button not found');
    btn.click();
  }

  async function sendAndSettle(container, text) {
    const ta = getTextarea(container);
    flushSync(() => setTextareaValue(ta, text));
    clickSend(container);
    // handleSend is async; let the fetch promise resolve, the assistant
    // message commit, and the open_terminal useEffect run.
    await flushEffects();
    await flushEffects();
    await flushEffects();
  }

  test('dispatches workspace open with command_sent (no orphan term-* session)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        text: 'Terminal lista.',
        tool_results: [
          {
            tool: 'open_terminal',
            result: {
              opened: true,
              workspace: true,
              command_sent: 'ls',
              cwd: '/home/me/proj',
            },
          },
        ],
      }),
    });

    const { container, cleanup } = await renderIntoDom(React.createElement(ChatPanel));
    await sendAndSettle(container, 'abre terminal y ejecuta ls');

    const calls = findOpenTerminalEvents();
    expect(calls).toHaveLength(1);
    expect(calls[0][0].detail.command).toBe('ls');
    expect(calls[0][0].detail.workspace).toBe(true);
    expect(calls[0][0].detail.session_id).toBeNull();
    expect(calls[0][0].detail.focus).toBe(true);

    cleanup();
  });

  test('dispatches devhub:zed-open-terminal when open_terminal returns workspace open (no command)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        text: 'He abierto una terminal nueva.',
        tool_results: [
          {
            tool: 'open_terminal',
            result: { opened: true, workspace: true, cwd: null },
          },
        ],
      }),
    });

    const { container, cleanup } = await renderIntoDom(React.createElement(ChatPanel));
    await sendAndSettle(container, 'abre una terminal');

    const calls = findOpenTerminalEvents();
    expect(calls).toHaveLength(1);
    const ev = calls[0][0];
    expect(ev).toBeInstanceOf(dom.window.CustomEvent);
    expect(ev.detail.command).toBeNull();
    expect(ev.detail.workspace).toBe(true);

    cleanup();
  });

  test('does NOT dispatch devhub:zed-open-terminal when the open_terminal result is an error', async () => {
    // Negative case: the early-return `if (!result || result.error) return;`
    // short-circuits the dispatch for error results. Lock it in.
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        text: 'No pude abrir la terminal.',
        tool_results: [{ tool: 'open_terminal', result: { error: 'port 4077 already in use' } }],
      }),
    });

    const { container, cleanup } = await renderIntoDom(React.createElement(ChatPanel));
    await sendAndSettle(container, 'abre una terminal');

    expect(findOpenTerminalEvents()).toHaveLength(0);

    cleanup();
  });

  test('T-WSR-zed-001: re-fire guard — second message does NOT re-dispatch the same session_id', async () => {
    // ASST-UI-001: the dispatch useEffect MUST NOT re-fire the event for
    // the same session_id. Without the guard, every subsequent
    // `messages` change re-runs the effect and the same assistant turn
    // (the one that contains the open_terminal result) is re-found, so
    // the event fires multiple times. The fix uses a useRef<Set> of
    // dispatched session_ids.
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        text: 'He abierto una terminal nueva.',
        tool_results: [
          {
            tool: 'open_terminal',
            result: { session_id: 'term-1', port: 4077, wsPath: '/terminal' },
          },
        ],
      }),
    });

    const { container, cleanup } = await renderIntoDom(React.createElement(ChatPanel));

    // 1st message — opens the terminal.
    await sendAndSettle(container, 'abre una terminal');
    expect(findOpenTerminalEvents()).toHaveLength(1);

    // 2nd message — any content. With the guard in place, the
    // open_terminal useEffect re-runs but the session_id 'term-1' is
    // already in the dispatched set, so we must NOT see a second
    // dispatch.
    await sendAndSettle(container, 'ahora corré ls');
    expect(findOpenTerminalEvents()).toHaveLength(1);

    cleanup();
  });

  // ----- T-WSR-zed-002 (ASST-CHAT-001) -----
  test('T-WSR-zed-002: 2nd request body includes the previous assistant turn + tool_result line, and the new user message is the `message` field (not duplicated inside `history`)', async () => {
    // ASST-CHAT-001: the closure fix (drop .slice(0, -1)) makes the
    // previous assistant turn + its `Tool <name> result: ...` line
    // visible to the model on the next request. Without the fix, the
    // previous assistant turn is sliced off, the model has no memory
    // of its own `open_terminal` call, and it re-issues the tool.
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy;

    // 1st call: returns the open_terminal tool result.
    // 2nd call: anything (we just need the body).
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        text: 'He abierto una terminal nueva.',
        tool_results: [
          {
            tool: 'open_terminal',
            result: { session_id: 'term-X', port: 4077, wsPath: '/terminal' },
          },
        ],
      }),
    });
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ text: 'ok', tool_results: [] }),
    });

    const { container, cleanup } = await renderIntoDom(React.createElement(ChatPanel));

    // 1st message: open a terminal.
    await sendAndSettle(container, 'abre una terminal');
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // 2nd message: now run ls.
    await sendAndSettle(container, 'ahora corré ls');
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    // Inspect the 2nd request body.
    const secondCall = fetchSpy.mock.calls[1];
    const init = secondCall[1];
    const body = JSON.parse(init.body);
    expect(body.message).toBe('ahora corré ls');

    // The history must contain the previous assistant turn + the
    // tool_result line.
    const historyStr = JSON.stringify(body.history);
    expect(historyStr).toMatch(/Tool open_terminal result:.*term-X/);

    // The new user message MUST NOT appear inside `history` (only as
    // `message`).
    const historyHasNewMsg = body.history.some(
      (entry) => entry && entry.role === 'user' && entry.content === 'ahora corré ls'
    );
    expect(historyHasNewMsg).toBe(false);

    cleanup();
  });
});

describe('ChatPanel — paste behavior (T-018)', () => {
  let dom;

  beforeEach(() => {
    dom = installDom();
    ({ createRoot } = require('react-dom/client'));
    ({ flushSync } = require('react-dom'));
    ChatPanel = require('../ChatPanel').default;
  });

  afterEach(() => {
    dom.window.close();
    jest.clearAllMocks();
  });

  function getTextarea(container) {
    // The textarea is the only <textarea> in the ChatPanel render.
    const ta = container.querySelector('textarea');
    if (!ta) throw new Error('textarea not found in ChatPanel');
    return ta;
  }

  test('textarea onPaste handler exists and inserts clipboard text into input', async () => {
    // T-018: paste from clipboard must work in the ChatPanel textarea.
    // Simulate the browser's default paste behavior by dispatching a
    // `paste` ClipboardEvent with clipboardData on the textarea. After
    // the handler runs, the textarea's value reflects the pasted text.
    const { container, cleanup } = await renderIntoDom(React.createElement(ChatPanel));
    const ta = getTextarea(container);

    // Build a DataTransfer-like object the handler can read.
    const dataTransfer = {
      getData: (type) => (type === 'text/plain' ? 'hello world' : ''),
    };
    const pasteEvent = new dom.window.Event('paste', { bubbles: true, cancelable: true });
    pasteEvent.clipboardData = dataTransfer;
    ta.dispatchEvent(pasteEvent);

    // The handler must call preventDefault (we own the paste) and insert
    // the text into the textarea. React updates the value asynchronously,
    // so flush before asserting.
    flushSync(() => {});
    expect(ta.value).toBe('hello world');
    cleanup();
  });

  test('Ctrl+V keydown does not call preventDefault on the textarea (paste is allowed)', async () => {
    // T-018: a Ctrl+V keydown on the textarea must not be cancelled.
    // The textarea's own onKeyDown only acts on Enter. A previous
    // regression: a document-level capture keydown handler in
    // TerminalTTY.jsx intercepted Ctrl+V whenever the terminal was
    // marked `isActivePanel` — blocking paste in the right-dock chat.
    // The ChatPanel fix + the TerminalTTY `belongsToTerminal` tightening
    // restore normal browser behavior: Ctrl+V triggers the default
    // paste flow (the textarea's onPaste handler above).
    const { container, cleanup } = await renderIntoDom(React.createElement(ChatPanel));
    const ta = getTextarea(container);

    const preventDefault = jest.fn();
    const ev = new dom.window.KeyboardEvent('keydown', {
      key: 'v',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    // jsdom doesn't let us observe preventDefault via .defaultPrevented
    // for synthetic events the way real browsers do, so we patch the
    // instance to record calls.
    ev.preventDefault = preventDefault;
    ta.dispatchEvent(ev);

    // The textarea's onKeyDown only acts on Enter, so preventDefault
    // must NOT have been called for Ctrl+V.
    expect(preventDefault).not.toHaveBeenCalled();
    cleanup();
  });
});
