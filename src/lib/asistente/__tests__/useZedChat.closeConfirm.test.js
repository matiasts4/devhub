'use strict';

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
jest.mock('../zedStreamProtocol', () => ({
  consumeZedSseStream: jest.fn(),
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
  const chat = useZedChat({ sessionKey: 'zed-close-confirm-test', streamEnabled: false });
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

describe('useZedChat close_terminal (no confirmation)', () => {
  let dom;

  beforeEach(() => {
    dom = installDom();
    dom.window.sessionStorage.clear();
  });

  afterEach(() => {
    global.fetch = REAL_FETCH;
    delete global.window;
    delete global.document;
    delete global.navigator;
    delete global.sessionStorage;
  });

  test('does NOT set pendingApproval when close_terminal succeeds immediately', async () => {
    let chatRef = null;
    global.fetch = jest.fn(async () => ({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({
        text: 'Cerré la terminal Chase.',
        tool_results: [
          {
            tool: 'close_terminal',
            input: { name: 'Chase' },
            result: {
              success: true,
              session_id: 'p1',
              displayName: 'Chase',
              panel_closed: true,
            },
          },
        ],
      }),
    }));

    const { unmount } = await mountChat((chat) => {
      chatRef = chat;
    });

    await act(async () => {
      chatRef.setInput('cerrá la terminal Chase');
    });
    await act(async () => {
      await chatRef.handleSend();
    });

    expect(chatRef.pendingApproval).toBeNull();

    unmount();
  });
});
