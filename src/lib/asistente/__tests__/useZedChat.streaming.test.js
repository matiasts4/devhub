/**
 * @jest-environment jsdom
 */

'use strict';

const { renderHook, act } = require('@testing-library/react');

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

let streamCallback = null;
let resolveConsume = null;
let rejectConsume = null;

jest.mock('../zedStreamProtocol', () => ({
  consumeZedSseStream: jest.fn((_reader, cb) => {
    streamCallback = cb;
    return new Promise((resolve, reject) => {
      resolveConsume = resolve;
      rejectConsume = reject;
    });
  }),
}));

const REAL_FETCH = global.fetch;

function streamFetchResponse() {
  return Promise.resolve({
    ok: true,
    headers: {
      get: (name) => (name && name.toLowerCase() === 'content-type' ? 'text/event-stream' : ''),
    },
    body: { getReader: jest.fn() },
  });
}

describe('useZedChat SSE streaming', () => {
  beforeEach(() => {
    streamCallback = null;
    resolveConsume = null;
    rejectConsume = null;
    global.fetch = jest.fn(streamFetchResponse);
    global.IS_REACT_ACT_ENVIRONMENT = true;
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.clear();
    }
  });

  afterEach(() => {
    global.fetch = REAL_FETCH;
  });

  test('shows partial assistant message during stream and final message after done', async () => {
    const { useZedChat } = require('../useZedChat');
    const { result, unmount } = renderHook(() =>
      useZedChat({ sessionKey: 'zed-streaming-test', streamEnabled: true })
    );

    act(() => {
      result.current.setInput('contame algo');
    });

    let sendPromise;
    await act(async () => {
      sendPromise = result.current.handleSend();
      while (!streamCallback) {
        await Promise.resolve();
      }
    });

    // Stream consumer has registered by now.
    act(() => {
      streamCallback({ event: 'text_delta', data: { text: 'Procesando tu solicitud' } });
    });

    expect(result.current.streamingMessage).toMatchObject({
      role: 'assistant',
      content: 'Procesando tu solicitud',
      partial: true,
    });
    expect(result.current.messages).toHaveLength(2); // greeting + user

    act(() => {
      streamCallback({
        event: 'done',
        data: {
          text: 'Respuesta final.',
          tool_results: [{ tool: 'open_terminal', input: {}, result: { success: true } }],
          meta: { intent: 'test' },
          model: 'test-model',
        },
      });
      resolveConsume();
    });

    await act(async () => {
      await sendPromise;
    });

    expect(result.current.streamingMessage).toBeNull();
    expect(result.current.messages).toHaveLength(3);
    expect(result.current.messages[2]).toMatchObject({
      role: 'assistant',
      content: 'Respuesta final.',
    });
    expect(result.current.messages[2].tool_results).toHaveLength(1);

    unmount();
  });

  test('clears partial message and shows cancelled text when the user stops the stream', async () => {
    const { useZedChat } = require('../useZedChat');
    const { result, unmount } = renderHook(() =>
      useZedChat({ sessionKey: 'zed-streaming-cancel-test', streamEnabled: true })
    );

    act(() => {
      result.current.setInput('cancelame');
    });

    let sendPromise;
    await act(async () => {
      sendPromise = result.current.handleSend();
      while (!streamCallback) {
        await Promise.resolve();
      }
    });

    act(() => {
      streamCallback({ event: 'text_delta', data: { text: 'Todavía no terminé' } });
    });

    expect(result.current.streamingMessage).not.toBeNull();

    act(() => {
      rejectConsume(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
      result.current.handleStop();
    });

    await act(async () => {
      await sendPromise;
    });

    expect(result.current.streamingMessage).toBeNull();
    const lastAssistant = [...result.current.messages]
      .reverse()
      .find((m) => m.role === 'assistant');
    expect(lastAssistant.content).toBe('(Solicitud cancelada)');

    unmount();
  });
});
