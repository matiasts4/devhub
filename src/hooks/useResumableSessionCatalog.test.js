const React = require('react');
const useResumableSessionCatalog = require('./useResumableSessionCatalog').default;
const {
  cleanupMountedRoots,
  click,
  createDeferred,
  flushEffects,
  installDom,
  renderIntoDom,
} = require('@/test-support/domHarness');
const {
  createResumableCatalogError,
  createResumableSession,
} = require('@/test-support/resumableSessionFixtures');

const mountedRoots = [];

function Harness({ adapters }) {
  const { status, sessions, error, isLoading, refresh, retry } = useResumableSessionCatalog({
    cwd: '/workspace/devhub',
    adapters,
  });

  return React.createElement(
    'div',
    null,
    React.createElement('div', { 'data-testid': 'status' }, status),
    React.createElement('div', { 'data-testid': 'loading' }, String(isLoading)),
    React.createElement('div', { 'data-testid': 'count' }, String(sessions.length)),
    React.createElement('div', { 'data-testid': 'error' }, error?.message || ''),
    React.createElement(
      'div',
      { 'data-testid': 'titles' },
      sessions.map((session) =>
        React.createElement(
          'span',
          { key: `${session.provider}:${session.sessionId}` },
          session.title
        )
      )
    ),
    React.createElement(
      'button',
      { type: 'button', 'data-testid': 'refresh', onClick: refresh },
      'refresh'
    ),
    React.createElement(
      'button',
      { type: 'button', 'data-testid': 'retry', onClick: retry },
      'retry'
    )
  );
}

describe('useResumableSessionCatalog', () => {
  let dom;

  beforeEach(() => {
    dom = installDom();
  });

  afterEach(() => {
    cleanupMountedRoots(mountedRoots);

    dom.window.close();
    jest.clearAllMocks();
  });

  test('transitions from loading to success with merged resumable sessions', async () => {
    const deferred = createDeferred();
    const adapters = [
      {
        id: 'opencode',
        supportsDurableResume: () => true,
        listSessions: jest.fn(() => deferred.promise),
      },
    ];

    const view = await renderIntoDom(React.createElement(Harness, { adapters }), mountedRoots);

    expect(view.container.querySelector('[data-testid="status"]')?.textContent).toBe('loading');
    expect(view.container.querySelector('[data-testid="loading"]')?.textContent).toBe('true');

    deferred.resolve({
      provider: 'opencode',
      status: 'success',
      sessions: [createResumableSession({ sessionId: 'oc-1', title: 'Daily sync' })],
      error: null,
    });
    await flushEffects();

    expect(view.container.querySelector('[data-testid="status"]')?.textContent).toBe('success');
    expect(view.container.querySelector('[data-testid="count"]')?.textContent).toBe('1');
    expect(view.container.querySelector('[data-testid="titles"]')?.textContent).toContain(
      'Daily sync'
    );
  });

  test('transitions to empty when providers return no resumable sessions', async () => {
    const adapters = [
      {
        id: 'opencode',
        supportsDurableResume: () => true,
        listSessions: jest.fn().mockResolvedValue({
          provider: 'opencode',
          status: 'empty',
          sessions: [],
          error: null,
        }),
      },
    ];

    const view = await renderIntoDom(React.createElement(Harness, { adapters }), mountedRoots);
    await flushEffects();

    expect(view.container.querySelector('[data-testid="status"]')?.textContent).toBe('empty');
    expect(view.container.querySelector('[data-testid="count"]')?.textContent).toBe('0');
  });

  test('supports retry after an error and clears into success on the next refresh', async () => {
    const listSessions = jest
      .fn()
      .mockResolvedValueOnce({
        provider: 'opencode',
        status: 'error',
        sessions: [],
        error: createResumableCatalogError(),
      })
      .mockResolvedValueOnce({
        provider: 'opencode',
        status: 'success',
        sessions: [
          createResumableSession({
            sessionId: 'oc-2',
            title: 'Recovered session',
            updatedAt: '2026-04-30T11:00:00.000Z',
          }),
        ],
        error: null,
      });

    const view = await renderIntoDom(
      React.createElement(Harness, {
        adapters: [{ id: 'opencode', supportsDurableResume: () => true, listSessions }],
      }),
      mountedRoots
    );
    await flushEffects();

    expect(view.container.querySelector('[data-testid="status"]')?.textContent).toBe('error');
    expect(view.container.querySelector('[data-testid="error"]')?.textContent).toContain(
      'timed out'
    );

    await click(view.container.querySelector('[data-testid="retry"]'));
    await flushEffects();

    expect(view.container.querySelector('[data-testid="status"]')?.textContent).toBe('success');
    expect(view.container.querySelector('[data-testid="titles"]')?.textContent).toContain(
      'Recovered session'
    );
  });

  test('aborts stale refreshes and ignores late responses from older requests', async () => {
    const first = createDeferred();
    const second = createDeferred();
    const signals = [];
    const listSessions = jest
      .fn()
      .mockImplementationOnce(({ signal }) => {
        signals.push(signal);
        return first.promise;
      })
      .mockImplementationOnce(({ signal }) => {
        signals.push(signal);
        return second.promise;
      });

    const view = await renderIntoDom(
      React.createElement(Harness, {
        adapters: [{ id: 'opencode', supportsDurableResume: () => true, listSessions }],
      }),
      mountedRoots
    );

    await click(view.container.querySelector('[data-testid="refresh"]'));
    expect(signals[0]?.aborted).toBe(true);

    second.resolve({
      provider: 'opencode',
      status: 'success',
      sessions: [
        createResumableSession({
          sessionId: 'oc-9',
          title: 'Latest request',
          updatedAt: '2026-04-30T12:00:00.000Z',
        }),
      ],
      error: null,
    });
    await flushEffects();

    first.resolve({
      provider: 'opencode',
      status: 'error',
      sessions: [],
      error: createResumableCatalogError({ message: 'stale response' }),
    });
    await flushEffects();

    expect(view.container.querySelector('[data-testid="status"]')?.textContent).toBe('success');
    expect(view.container.querySelector('[data-testid="titles"]')?.textContent).toContain(
      'Latest request'
    );
    expect(view.container.querySelector('[data-testid="error"]')?.textContent).toBe('');
  });
});
