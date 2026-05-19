/**
 * Telegram Bot Tests — Agent Control Commands
 *
 * Tests: /pausar, /reanudar, /spawn, /continuar
 */

const { TelegramTestHarness } = require('./harness');
const { seedSwarmConfig } = require('../fixtures');

describe('Telegram Agent Control Commands', () => {
  let harness;
  let originalMultiTurn;

  beforeEach(async () => {
    originalMultiTurn = process.env.TELEGRAM_MULTI_TURN;
    process.env.TELEGRAM_MULTI_TURN = 'false';

    harness = new TelegramTestHarness({ lockOwner: 'telegram-agent-control' });
    await harness.setup();
    seedSwarmConfig(harness.db, 'max_concurrent', '5');

    harness.mockService('session-bridge', {
      resolveTelegramAdapterContext: () => ({
        actor: { actor_id: 'telegram:test-user-1', devhub_actor_id: 'human-test-user-1' },
        envelope: { action: 'control' },
        outcome: {
          accepted: false,
          pending_approval: false,
          denial_reason: 'out-of-scope-orchestration',
          intent: {
            intent_id: 'intent-control-1',
            audit_status: 'denied',
            result_ref: 'telegram-intent://intent-control-1',
          },
        },
      }),
      getActiveSession: () => ({ id: 'mock-session-id' }),
    });

    harness.mockService('telegram-persister', {
      persistMessage: () => null,
    });
  });

  afterEach(async () => {
    harness.restoreService('telegram-persister');
    harness.restoreService('session-bridge');
    await harness.teardown();

    if (originalMultiTurn === undefined) {
      delete process.env.TELEGRAM_MULTI_TURN;
    } else {
      process.env.TELEGRAM_MULTI_TURN = originalMultiTurn;
    }
  });

  describe('/pausar', () => {
    test('denies pausar command because orchestration is quarantined', async () => {
      const ctx = harness.createMockCtx();
      await harness.executeCommand('pausar', ctx, 'agent-1');

      const replies = harness.getReplies();
      expect(replies).toHaveLength(1);
      expect(replies[0].text).toContain('Fuera de alcance');
      expect(replies[0].text).toContain('intent\\-control\\-1');
    });

    test('shows degraded message when durable read is unavailable', async () => {
      harness.mockService('session-bridge', {
        resolveTelegramAdapterContext: () => ({
          actor: { actor_id: 'telegram:test-user-1', devhub_actor_id: 'human-test-user-1' },
          envelope: { action: 'control' },
          outcome: {
            accepted: false,
            pending_approval: false,
            denial_reason: 'durable-read-unavailable',
            intent: {
              intent_id: 'intent-control-degraded',
              audit_status: 'denied',
              result_ref: 'telegram-intent://intent-control-degraded',
            },
          },
        }),
        getActiveSession: () => ({ id: 'mock-session-id' }),
      });

      const ctx = harness.createMockCtx();
      await harness.executeCommand('pausar', ctx);

      const replies = harness.getReplies();
      expect(replies).toHaveLength(1);
      expect(replies[0].text).toContain('Modo degradado');
      expect(replies[0].text).toContain('intent\\-control\\-degraded');
    });
  });

  describe('/reanudar', () => {
    test('denies reanudar command because orchestration is quarantined', async () => {
      const ctx = harness.createMockCtx();
      await harness.executeCommand('reanudar', ctx, 'agent-2');

      const replies = harness.getReplies();
      expect(replies).toHaveLength(1);
      expect(replies[0].text).toContain('Fuera de alcance');
      expect(replies[0].text).toContain('intent\\-control\\-1');
    });
  });

  describe('/spawn', () => {
    test('denies spawn command because orchestration is quarantined', async () => {
      const ctx = harness.createMockCtx();
      await harness.executeCommand('spawn', ctx, 'Implementar auth JWT');

      const replies = harness.getReplies();
      expect(replies).toHaveLength(1);
      expect(replies[0].text).toContain('Fuera de alcance');
      expect(replies[0].text).toContain('intent\\-control\\-1');
    });
  });

  describe('/continuar', () => {
    test('denies continuar command because orchestration is quarantined', async () => {
      const ctx = harness.createMockCtx();
      await harness.executeCommand('continuar', ctx, 'devhub');

      const replies = harness.getReplies();
      expect(replies).toHaveLength(1);
      expect(replies[0].text).toContain('Fuera de alcance');
      expect(replies[0].text).toContain('intent\\-control\\-1');
    });
  });
});
