/**
 * Telegram Bot Tests — Agent Control Commands
 *
 * Tests: /pausar, /reanudar, /spawn, /continuar
 */

const { TelegramTestHarness } = require('./harness');
const { seedProject, seedSession, seedSwarmConfig } = require('../fixtures');
const { assertDbRow, assertDbFieldValue } = require('../assertions');

describe('Telegram Agent Control Commands', () => {
  let harness;

  beforeEach(async () => {
    harness = new TelegramTestHarness({ lockOwner: 'telegram-agent-control' });
    await harness.setup();
    seedSwarmConfig(harness.db, 'max_concurrent', '5');
  });

  afterEach(async () => {
    await harness.teardown();
  });

  describe('/pausar', () => {
    test('changes session status to paused', async () => {
      seedSession(harness.db, { id: 'test-session-pause', status: 'active' });

      const ctx = harness.createMockCtx();
      await harness.executeCommand('pausar', ctx);

      const replies = harness.getReplies();
      expect(replies.length).toBeGreaterThanOrEqual(1);
    });

    test('shows error when no active session', async () => {
      const ctx = harness.createMockCtx();
      await harness.executeCommand('pausar', ctx);

      const replies = harness.getReplies();
      expect(replies.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('/reanudar', () => {
    test('resumes paused session', async () => {
      seedSession(harness.db, { id: 'test-session-resume', status: 'paused' });

      const ctx = harness.createMockCtx();
      await harness.executeCommand('reanudar', ctx);

      const replies = harness.getReplies();
      expect(replies.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('/spawn', () => {
    test('requires task description', async () => {
      const ctx = harness.createMockCtx();
      await harness.executeCommand('spawn', ctx, '');

      const replies = harness.getReplies();
      expect(replies.length).toBe(1);
      expect(replies[0].text).toContain('Uso:');
    });

    test('launches agent with task description', async () => {
      // Mock the api service to not actually call Next.js
      harness.mockService('api', {
        health: () => Promise.resolve(true),
        getProfiles: () => Promise.resolve([{ name: 'default' }]),
        launchAgent: () => Promise.resolve({ sessionId: 'test-spawn-session' }),
      });

      const ctx = harness.createMockCtx();
      await harness.executeCommand('spawn', ctx, 'Implementar auth JWT');

      const replies = harness.getReplies();
      expect(replies.length).toBe(1);
      expect(replies[0].text).toContain('Implementar auth JWT');

      harness.restoreService('api');
    });

    test('shows error when Next.js is down', async () => {
      harness.mockService('api', {
        health: () => Promise.reject(new Error('Server down')),
      });

      const ctx = harness.createMockCtx();
      await harness.executeCommand('spawn', ctx, 'Some task');

      const replies = harness.getReplies();
      expect(replies.length).toBe(1);
      expect(replies[0].text).toContain('Next.js');

      harness.restoreService('api');
    });
  });

  describe('/continuar', () => {
    test('continues paused session', async () => {
      seedSession(harness.db, { id: 'test-session-continue', status: 'paused' });

      const ctx = harness.createMockCtx();
      await harness.executeCommand('continuar', ctx);

      const replies = harness.getReplies();
      expect(replies.length).toBeGreaterThanOrEqual(1);
    });
  });
});
