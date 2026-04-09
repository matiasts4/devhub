/**
 * Telegram Bot Tests — Session Commands
 *
 * Tests: /sesiones, /nueva_sesion, /session, /project, /status, /agente, /historial
 */

const { TelegramTestHarness } = require('./harness');
const { seedProject, seedSession } = require('../fixtures');

describe('Telegram Session Commands', () => {
  let harness;

  beforeEach(async () => {
    harness = new TelegramTestHarness({ lockOwner: 'telegram-sessions' });
    await harness.setup();
  });

  afterEach(async () => {
    await harness.teardown();
  });

  describe('/sesiones', () => {
    test('lists sessions for chat', async () => {
      seedSession(harness.db, {
        id: 'test-sess-1',
        title: 'Session 1',
        telegram_chat_id: 'test-chat-1',
      });
      seedSession(harness.db, {
        id: 'test-sess-2',
        title: 'Session 2',
        telegram_chat_id: 'test-chat-1',
      });

      const ctx = harness.createMockCtx();
      await harness.executeCommand('sesiones', ctx);

      const replies = harness.getReplies();
      expect(replies.length).toBeGreaterThanOrEqual(1);
    });

    test('shows empty when no sessions', async () => {
      const ctx = harness.createMockCtx();
      await harness.executeCommand('sesiones', ctx);

      const replies = harness.getReplies();
      expect(replies.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('/nueva_sesion', () => {
    test('creates new session', async () => {
      const ctx = harness.createMockCtx();
      await harness.executeCommand('nueva_sesion', ctx);

      const replies = harness.getReplies();
      expect(replies.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('/session', () => {
    test('switches active session', async () => {
      seedSession(harness.db, { id: 'test-sess-switch', title: 'Switch Session' });

      const ctx = harness.createMockCtx();
      await harness.executeCommand('session', ctx, 'test-sess-switch');

      const replies = harness.getReplies();
      expect(replies.length).toBeGreaterThanOrEqual(1);
    });

    test('shows error for non-existent session', async () => {
      const ctx = harness.createMockCtx();
      await harness.executeCommand('session', ctx, 'non-existent-id');

      const replies = harness.getReplies();
      expect(replies.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('/project', () => {
    test('shows project info', async () => {
      seedProject(harness.db, { id: 'test-proj-info', name: 'Info Project' });

      const ctx = harness.createMockCtx();
      await harness.executeCommand('project', ctx, 'test-proj-info');

      const replies = harness.getReplies();
      expect(replies.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('/status', () => {
    test('shows detailed status', async () => {
      const ctx = harness.createMockCtx();
      await harness.executeCommand('status', ctx);

      const replies = harness.getReplies();
      expect(replies.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('/agente', () => {
    test('shows agent info', async () => {
      const ctx = harness.createMockCtx();
      await harness.executeCommand('agente', ctx);

      const replies = harness.getReplies();
      expect(replies.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('/historial', () => {
    test('shows chat history', async () => {
      const ctx = harness.createMockCtx();
      await harness.executeCommand('historial', ctx);

      const replies = harness.getReplies();
      expect(replies.length).toBeGreaterThanOrEqual(1);
    });
  });
});
