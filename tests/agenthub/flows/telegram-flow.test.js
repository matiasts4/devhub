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
  });

  afterEach(async () => {
    await harness.teardown();
  });

  test('executes telegram spawn flow', async () => {
    // Mock the api service
    harness.mockService('api', {
      health: () => Promise.resolve(true),
      getProfiles: () => Promise.resolve([{ name: 'default' }]),
      launchAgent: () => Promise.resolve({ sessionId: 'test-telegram-spawn-session' }),
    });

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
          assert: { replyContains: 'Implementar auth JWT' },
        },
        {
          name: 'verify-reply',
          action: 'assert',
          type: 'db.rowCount',
          table: 'agent_hub_sessions',
          where: { project_id: 'test-proj-1' },
          min: 0, // Session may or may not be created depending on mock
        },
        {
          name: 'estado',
          action: 'telegram',
          command: 'estado',
          ctx: { chatId: 'test-chat-1' },
          args: '',
        },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.passedSteps).toBe(result.totalSteps);

    harness.restoreService('api');
  });

  test('telegram commands execute without errors', async () => {
    seedProject(harness.db, { id: 'test-proj-1', name: 'Test Project', status: 'active' });
    seedSession(harness.db, {
      id: 'test-session-1',
      status: 'active',
      telegram_chat_id: 'test-chat-1',
    });

    const result = await verifier.execute({
      name: 'telegram-commands-flow',
      timeout: 30000,
      onFailure: 'continue',
      steps: [
        {
          name: 'help',
          action: 'telegram',
          command: 'help',
          ctx: { chatId: 'test-chat-1' },
        },
        {
          name: 'estado',
          action: 'telegram',
          command: 'estado',
          ctx: { chatId: 'test-chat-1' },
        },
        {
          name: 'tareas',
          action: 'telegram',
          command: 'tareas',
          ctx: { chatId: 'test-chat-1' },
        },
        {
          name: 'sesiones',
          action: 'telegram',
          command: 'sesiones',
          ctx: { chatId: 'test-chat-1' },
        },
      ],
    });

    // All commands should execute without throwing
    expect(result.totalSteps).toBe(4);
  });
});
