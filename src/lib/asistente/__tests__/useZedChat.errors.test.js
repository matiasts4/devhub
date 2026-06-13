'use strict';

/**
 * T-301 / ZCX-001 — useZedChat routes fetch failures through formatToolErrorForUser.
 * AbortError stays as "(Solicitud cancelada)"; no literal "Error:" prefix in chat.
 */

const React = require('react');
const { JSDOM } = require('jsdom');
const { act } = require('react');

jest.mock('@/components/zedOpenTerminalEvent', () => ({
  dispatchZedOpenTerminal: jest.fn(),
}));
jest.mock('@/components/zedOpenUrlEvent', () => ({
  dispatchZedOpenUrlFromToolResults: jest.fn(),
}));
jest.mock('../dispatchZedActions', () => ({
  dispatchAllZedToolResults: jest.fn(),
}));
jest.mock('../zedOverlayEvents', () => ({
  dispatchZedAuraToolType: jest.fn(),
  dispatchZedAuraOutcome: jest.fn(),
}));

const REAL_FETCH = global.fetch;

function installDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://devhub.test',
  });
  global.window = dom.window;
  global.document = dom.window.document;
  global.navigator = dom.window.navigator;
  global.sessionStorage = dom.window.sessionStorage;
  global.IS_REACT_ACT_ENVIRONMENT = true;
  return dom;
}

function TestHarness({ onReady }) {
  const { useZedChat } = require('../useZedChat');
  const chat = useZedChat({ sessionKey: 'zed-errors-test' });
  React.useEffect(() => {
    onReady(chat);
  }, [chat, onReady]);
  return null;
}

async function mountChat(onReady) {
  const { createRoot } = require('react-dom/client');
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(React.createElement(TestHarness, { onReady }));
  });

  return {
    unmount: () => {
      act(() => {
        root.unmount();
      });
    },
  };
}

function lastAssistantReply(messages) {
  const userIdx = messages.findLastIndex((m) => m.role === 'user');
  if (userIdx === -1) return null;
  return messages.slice(userIdx + 1).find((m) => m.role === 'assistant') || null;
}

describe('useZedChat error formatting (T-301 / ZCX-001)', () => {
  let dom;

  beforeEach(() => {
    dom = installDom();
    dom.window.sessionStorage.clear();
  });

  afterEach(() => {
    global.fetch = REAL_FETCH;
    delete global.IS_REACT_ACT_ENVIRONMENT;
    dom.window.close();
  });

  test('HTTP failure surfaces formatter output without Error: prefix', async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 503,
      json: async () => ({ error: 'Error: servicio no disponible' }),
    }));

    let chatRef = null;
    const { unmount } = await mountChat((chat) => {
      chatRef = chat;
    });

    await act(async () => {
      chatRef.setInput('hola');
    });
    await act(async () => {
      await chatRef.handleSend();
    });

    const last = lastAssistantReply(chatRef.messages);
    expect(last.content).toBe('servicio no disponible');
    expect(last.content).not.toMatch(/^Error:/);
    unmount();
  });

  test('thrown Error with stack frames strips debugging noise', async () => {
    global.fetch = jest.fn(async () => {
      const err = new Error('Error: falló la red');
      err.stack = 'Error: falló la red\n    at fetch.js:12:3';
      throw err;
    });

    let chatRef = null;
    const { unmount } = await mountChat((chat) => {
      chatRef = chat;
    });

    await act(async () => {
      chatRef.setInput('hola');
    });
    await act(async () => {
      await chatRef.handleSend();
    });

    const last = lastAssistantReply(chatRef.messages);
    expect(last.content).toBe('falló la red');
    expect(last.content).not.toContain('at fetch.js');
    unmount();
  });

  test('AbortError keeps the canonical cancelled message', async () => {
    global.fetch = jest.fn((_url, options) => {
      const { signal } = options || {};
      return new Promise((_, reject) => {
        if (signal?.aborted) {
          reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
          return;
        }
        signal?.addEventListener('abort', () => {
          reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
        });
      });
    });

    let chatRef = null;
    const { unmount } = await mountChat((chat) => {
      chatRef = chat;
    });

    await act(async () => {
      chatRef.setInput('cancelame');
    });

    let pending;
    await act(async () => {
      pending = chatRef.handleSend();
    });
    // handleStop closes over abortController from the render after handleSend started.
    await act(async () => {
      chatRef.handleStop();
    });
    await act(async () => {
      await pending;
    });

    const last = lastAssistantReply(chatRef.messages);
    expect(last.content).toBe('(Solicitud cancelada)');
    unmount();
  });
});
