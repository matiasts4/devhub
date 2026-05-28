const mockReadDirectorFeedSummary = jest.fn();
const mockGetDb = jest.fn();

jest.mock('@/lib/db/localDb.js', () => ({
  getDb: (...args) => mockGetDb(...args),
}));

jest.mock('@/lib/db/compactReads.js', () => ({
  readDirectorFeedSummary: (...args) => mockReadDirectorFeedSummary(...args),
}));

function createMockDb({
  activeMission = null,
  sessions = [],
  traceCounts = [],
  traces = [],
  textLengths = [],
  usages = [],
  missionById = null,
  missionByProject = null,
} = {}) {
  return {
    prepare: jest.fn((sql) => {
      if (sql.includes('WHERE mission_id = ?')) {
        return { get: jest.fn(() => missionById) };
      }

      if (sql.includes("WHERE status = 'active' AND project_id = ?")) {
        return { get: jest.fn(() => missionByProject) };
      }

      if (sql.includes('FROM swarm_missions')) {
        return { get: jest.fn(() => activeMission) };
      }

      if (sql.includes('FROM agent_hub_sessions')) {
        return { all: jest.fn(() => sessions) };
      }

      if (sql.includes('COUNT(*) as count') && sql.includes('FROM agent_traces')) {
        return { all: jest.fn(() => traceCounts) };
      }

      if (sql.includes('SUM(length(content)) as total_len')) {
        return { all: jest.fn(() => textLengths) };
      }

      if (sql.includes('FROM agent_session_usage')) {
        return { all: jest.fn(() => usages) };
      }

      if (sql.includes('FROM agent_traces')) {
        return { all: jest.fn(() => traces) };
      }

      throw new Error(`Unhandled SQL in sessions/stream route test: ${sql}`);
    }),
  };
}

describe('agenthub sessions stream route helpers', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('buildSnapshot reuses shared durable director_feed summary for the active mission', async () => {
    const directorFeed = {
      authority: 'durable',
      freshness: 'current',
      watermark: 'director-feed-watermark-1',
      items: [
        {
          feed_id: 'agent_event:1',
          kind: 'handoff_ready',
          mission_id: 'mission-feed-1',
          summary: 'Executor handoff ready',
        },
      ],
      handoff: {
        status: 'ready',
        recipient_agent_id: 'agent-worker-1',
        message: 'Executor handoff ready',
      },
    };
    const mockDb = createMockDb({
      activeMission: { mission_id: 'mission-feed-1' },
      sessions: [
        {
          id: 'session-1',
          project_id: 'project-1',
          title: 'Session 1',
          custom_name: null,
          agent_model: 'gpt-5.4',
          status: 'active',
          visibility: 'visible',
          opencode_session_id: 'oc-1',
          created_at: '2026-05-26T21:00:00.000Z',
          updated_at: '2026-05-26T21:00:00.000Z',
        },
      ],
    });
    mockGetDb.mockReturnValue(mockDb);
    mockReadDirectorFeedSummary.mockReturnValue(directorFeed);

    const { buildSnapshot } = await import('./route.js');
    const snapshot = buildSnapshot();

    expect(mockReadDirectorFeedSummary).toHaveBeenCalledWith(mockDb, {
      missionId: 'mission-feed-1',
    });
    expect(snapshot.directorFeed).toBe(directorFeed);
    expect(snapshot.sessions).toEqual([
      expect.objectContaining({
        id: 'session-1',
        traceCount: 0,
        textLength: 0,
        usage: null,
      }),
    ]);
  });

  test('buildSnapshot scopes director_feed to the requested project mission when provided', async () => {
    const directorFeed = {
      authority: 'durable',
      freshness: 'current',
      watermark: 'director-feed-project-scope',
      items: [
        {
          feed_id: 'agent_event:project-scope',
          kind: 'task_completed',
          mission_id: 'mission-project-1',
          summary: 'Scoped by project',
        },
      ],
      handoff: { status: 'idle' },
    };
    const mockDb = createMockDb({
      missionByProject: { mission_id: 'mission-project-1' },
    });
    mockGetDb.mockReturnValue(mockDb);
    mockReadDirectorFeedSummary.mockReturnValue(directorFeed);

    const { buildSnapshot } = await import('./route.js');
    const snapshot = buildSnapshot(null, { projectId: 'project-1' });

    expect(mockReadDirectorFeedSummary).toHaveBeenCalledWith(mockDb, {
      missionId: 'mission-project-1',
    });
    expect(snapshot.directorFeed).toBe(directorFeed);
  });

  test('buildSnapshot scopes director_feed to an explicit mission id over global active mission', async () => {
    const directorFeed = {
      authority: 'durable',
      freshness: 'current',
      watermark: 'director-feed-mission-scope',
      items: [
        {
          feed_id: 'agent_event:mission-scope',
          kind: 'handoff_ready',
          mission_id: 'mission-explicit',
          summary: 'Scoped by mission',
        },
      ],
      handoff: { status: 'ready' },
    };
    const mockDb = createMockDb({
      activeMission: { mission_id: 'mission-global' },
      missionById: { mission_id: 'mission-explicit' },
    });
    mockGetDb.mockReturnValue(mockDb);
    mockReadDirectorFeedSummary.mockReturnValue(directorFeed);

    const { buildSnapshot } = await import('./route.js');
    const snapshot = buildSnapshot(null, { missionId: 'mission-explicit', projectId: 'project-1' });

    expect(mockReadDirectorFeedSummary).toHaveBeenCalledWith(mockDb, {
      missionId: 'mission-explicit',
    });
    expect(snapshot.directorFeed).toBe(directorFeed);
  });

  test('computeDelta keeps director_feed unchanged when watermark is stable and only stream state changes', async () => {
    const { computeDelta } = await import('./route.js');

    const prev = {
      sessions: [
        {
          id: 'session-1',
          status: 'active',
          updated_at: '2026-05-26T21:00:00.000Z',
          traceCount: 1,
          textLength: 20,
          usage: { total_tokens: 10 },
          lastTraceAt: '2026-05-26T21:00:00.000Z',
        },
      ],
      tracesBySession: {},
      directorFeed: {
        authority: 'durable',
        freshness: 'current',
        watermark: 'director-feed-watermark-stable',
        items: [],
        handoff: { status: 'idle' },
      },
    };
    const curr = {
      sessions: [
        {
          id: 'session-1',
          status: 'active',
          updated_at: '2026-05-26T21:00:05.000Z',
          traceCount: 1,
          textLength: 21,
          usage: { total_tokens: 10 },
          lastTraceAt: '2026-05-26T21:00:00.000Z',
        },
      ],
      tracesBySession: {},
      _safeParse: JSON.parse,
      directorFeed: {
        authority: 'durable',
        freshness: 'current',
        watermark: 'director-feed-watermark-stable',
        items: [],
        handoff: { status: 'idle' },
      },
    };

    const delta = computeDelta(prev, curr);

    expect(delta.updatedSessions).toEqual([
      expect.objectContaining({ id: 'session-1', updated_at: '2026-05-26T21:00:05.000Z' }),
    ]);
    expect(delta.directorFeedChanged).toBe(false);
    expect(delta.directorFeed).toEqual(curr.directorFeed);
  });

  test('computeDelta emits director_feed change only after durable watermark mutation', async () => {
    const { computeDelta, activeMissionIdFromFeed } = await import('./route.js');

    const prev = {
      sessions: [],
      tracesBySession: {},
      directorFeed: {
        authority: 'durable',
        freshness: 'current',
        watermark: 'director-feed-watermark-1',
        items: [],
        handoff: { status: 'idle' },
      },
    };
    const curr = {
      sessions: [],
      tracesBySession: {},
      _safeParse: JSON.parse,
      directorFeed: {
        authority: 'durable',
        freshness: 'current',
        watermark: 'director-feed-watermark-2',
        items: [
          {
            feed_id: 'agent_event:2',
            kind: 'handoff_ready',
            mission_id: 'mission-feed-2',
            summary: 'Executor handoff ready',
          },
        ],
        handoff: {
          status: 'ready',
          recipient_agent_id: 'agent-worker-2',
          message: 'Executor handoff ready',
        },
      },
    };

    const delta = computeDelta(prev, curr);

    expect(delta.directorFeedChanged).toBe(true);
    expect(delta.directorFeed).toEqual(curr.directorFeed);
    expect(activeMissionIdFromFeed(curr.directorFeed)).toBe('mission-feed-2');
  });
});
