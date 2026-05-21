const {
  closeTerminalSessions,
  syncWorkspaceCountersMonotonic,
} = require('../terminal/workspaceStateHelpers.js');

describe('syncWorkspaceCountersMonotonic()', () => {
  test('does not shrink counters when visible max ids get smaller after panel removal', () => {
    const workspaces = [
      {
        id: 'ws1',
        columns: [
          { id: 'c1', panels: [{ id: 'p1' }] },
          { id: 'c2', panels: [{ id: 'p2' }] },
        ],
      },
    ];

    const counters = syncWorkspaceCountersMonotonic(workspaces, {
      workspace: 2,
      column: 3,
      panel: 3,
    });

    expect(counters).toEqual({ workspace: 2, column: 3, panel: 3 });
  });

  test('raises counters when a larger visible id is restored from persisted state', () => {
    const workspaces = [
      {
        id: 'ws4',
        columns: [
          { id: 'c7', panels: [{ id: 'p9' }] },
          { id: 'c8', panels: [{ id: 'p10' }] },
        ],
      },
    ];

    const counters = syncWorkspaceCountersMonotonic(workspaces, {
      workspace: 1,
      column: 1,
      panel: 1,
    });

    expect(counters).toEqual({ workspace: 4, column: 8, panel: 10 });
  });
});

describe('closeTerminalSessions()', () => {
  let originalWindow;
  let originalCustomEvent;

  beforeEach(() => {
    originalWindow = global.window;
    originalCustomEvent = global.CustomEvent;
  });

  afterEach(() => {
    global.window = originalWindow;
    global.CustomEvent = originalCustomEvent;
  });

  test('issues DELETE requests for every explicit panel session id', async () => {
    const fetchMock = jest.fn(() => Promise.resolve({ ok: true }));

    await closeTerminalSessions(['p3', 'p4'], fetchMock);

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/terminal/session?sessionId=p3', {
      method: 'DELETE',
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/terminal/session?sessionId=p4', {
      method: 'DELETE',
    });
  });

  test('ignores empty and duplicate ids', async () => {
    const fetchMock = jest.fn(() => Promise.resolve({ ok: true }));

    await closeTerminalSessions(['p3', null, 'p3', '', undefined], fetchMock);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/terminal/session?sessionId=p3', {
      method: 'DELETE',
    });
  });

  test('announces explicit native/session close before removing terminal sessions', async () => {
    const fetchMock = jest.fn(() => Promise.resolve({ ok: true }));
    const events = [];
    global.CustomEvent = class {
      constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail;
      }
    };
    global.window = {
      dispatchEvent: jest.fn((event) => {
        events.push(event);
      }),
    };

    await closeTerminalSessions(['p3'], fetchMock);

    expect(global.window.dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'devhub:terminal-session-closing',
        detail: { panelId: 'p3' },
      })
    );
    expect(events[0].type).toBe('devhub:terminal-session-closing');
    expect(fetchMock).toHaveBeenCalledWith('/api/terminal/session?sessionId=p3', {
      method: 'DELETE',
    });
  });
});
