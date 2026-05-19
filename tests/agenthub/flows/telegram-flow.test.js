/**
 * Flow Tests — Telegram Bot Flow
 *
 * Flow: /spawn → verify session → /estado → verify status
 */

const { TelegramTestHarness } = require('../telegram/harness');
const { FlowVerifier } = require('../flow-verifier');
const { seedProject, seedSession, seedSwarmConfig } = require('../fixtures');

describe('Flow: Telegram Bot', () => {
  let harness;
  let verifier;

  beforeEach(async () => {
    harness = new TelegramTestHarness({ lockOwner: 'flow-telegram' });
    await harness.setup();
    seedSwarmConfig(harness.db, 'max_concurrent', '5');
    verifier = new FlowVerifier(harness);

    harness.mockServices({
      db: {
        getDashboard: () => [
          {
            id: 'test-proj-1',
            name: 'Test Project',
            status: 'active',
            progress: 50,
            color: null,
            tasks: { total: 2, completed: 1, in_progress: 1, blocked: 0 },
            next_milestone: null,
          },
        ],
        getActiveProjects: () => [{ id: 'test-proj-1', name: 'Test Project', status: 'active' }],
        getTasks: () => [{ id: 'task-1', title: 'Task 1', status: 'pending', priority: 'high' }],
      },
      api: {
        health: () => Promise.resolve(true),
        getProfiles: () => Promise.resolve([{ name: 'default' }]),
        launchAgent: () => Promise.resolve({ sessionId: 'test-telegram-spawn-session' }),
      },
      'session-bridge': {
        resolveTelegramAdapterContext: () => ({
          actor: { actor_id: 'telegram:test-user-1', devhub_actor_id: 'human-test-user-1' },
          envelope: { action: 'status.query' },
          outcome: {
            accepted: false,
            pending_approval: false,
            denial_reason: 'out-of-scope-orchestration',
            intent: {
              intent_id: 'intent-telegram-1',
              audit_status: 'denied',
              result_ref: 'telegram-intent://intent-telegram-1',
            },
          },
        }),
        getActiveSession: () => null,
        getSessions: () => [{ id: 'sess-1', title: 'Session 1', status: 'active' }],
      },
      formatter: {
        formatHelp: () => '*🤖 DevHub Bot — Ayuda*',
        formatDashboard: () => 'Test Project',
        formatTasks: () => 'Task 1',
        formatError: (message) => `Error: ${message}`,
        formatCommandQuarantined: () => '🚫 Fuera de alcance',
      },
      'telegram-persister': {
        persistMessage: () => null,
      },
      'lib/db-bridge': {
        getUsage: () => ({ total_tokens: 7, tool_calls_count: 1 }),
      },
    });
  });

  afterEach(async () => {
    harness.restoreService('lib/db-bridge');
    harness.restoreService('telegram-persister');
    harness.restoreService('formatter');
    harness.restoreService('session-bridge');
    harness.restoreService('api');
    harness.restoreService('db');
    await harness.teardown();
  });

  test('denies legacy telegram spawn flow as out of scope', async () => {
    const result = await verifier.execute({
      name: 'telegram-spawn-flow',
      timeout: 30000,
      onFailure: 'abort',
      locks: [{ type: 'flow', key: 'telegram-spawn-flow' }],
      steps: [
        {
          name: 'spawn',
          action: 'telegram',
          command: 'spawn',
          ctx: { chatId: 'test-chat-1' },
          args: 'Implementar auth JWT',
          assert: { replyContains: 'Fuera de alcance' },
        },
        {
          name: 'verify-no-session-created',
          action: 'assert',
          type: 'db.rowCount',
          table: 'agent_hub_sessions',
          where: { project_id: 'test-proj-1' },
          min: 0,
          max: 0,
        },
        {
          name: 'estado',
          action: 'telegram',
          command: 'estado',
          ctx: { chatId: 'test-chat-1' },
          args: '',
          assert: { replyContains: 'Test Project' },
        },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.passedSteps).toBe(result.totalSteps);
  });

  test('telegram commands execute without errors', async () => {
    const result = await verifier.execute({
      name: 'telegram-commands-flow',
      timeout: 30000,
      onFailure: 'abort',
      steps: [
        {
          name: 'help',
          action: 'telegram',
          command: 'help',
          ctx: { chatId: 'test-chat-1' },
          assert: { replyContains: 'Ayuda' },
        },
        {
          name: 'estado',
          action: 'telegram',
          command: 'estado',
          ctx: { chatId: 'test-chat-1' },
          assert: { replyContains: 'Test Project' },
        },
        {
          name: 'tareas',
          action: 'telegram',
          command: 'tareas',
          ctx: { chatId: 'test-chat-1' },
          assert: { replyContains: 'Task 1' },
        },
        {
          name: 'sesiones',
          action: 'telegram',
          command: 'sesiones',
          ctx: { chatId: 'test-chat-1' },
          assert: { replyContains: 'Session 1' },
        },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.totalSteps).toBe(4);
  });
});
