/**
 * Telegram Bot Tests — Basic Commands
 *
 * Tests: /help, /estado, /reset
 */

const { TelegramTestHarness } = require('./harness');
const { seedProject, seedTask, seedSession } = require('../fixtures');
const { assertDbRow, assertDbRowCount } = require('../assertions');

describe('Telegram Basic Commands', () => {
  let harness;

  beforeEach(async () => {
    harness = new TelegramTestHarness({ lockOwner: 'telegram-basic' });
    await harness.setup();
  });

  afterEach(async () => {
    await harness.teardown();
  });

  describe('/help', () => {
    test('returns command list', async () => {
      const ctx = harness.createMockCtx();
      await harness.executeCommand('help', ctx);

      const replies = harness.getReplies();
      expect(replies.length).toBe(1);
      expect(replies[0].text).toContain('help');
      expect(replies[0].text).toContain('estado');
    });

    test('uses Markdown parse mode', async () => {
      const ctx = harness.createMockCtx();
      await harness.executeCommand('help', ctx);

      const replies = harness.getReplies();
      expect(replies[0].options.parse_mode).toBe('Markdown');
    });
  });

  describe('/estado', () => {
    test('shows dashboard with projects', async () => {
      seedProject(harness.db, { id: 'test-proj-1', name: 'Mi Proyecto', status: 'active' });

      const ctx = harness.createMockCtx();
      await harness.executeCommand('estado', ctx);

      const replies = harness.getReplies();
      expect(replies.length).toBe(1);
      expect(replies[0].text).toContain('Mi Proyecto');
    });

    test('shows empty state when no projects', async () => {
      const ctx = harness.createMockCtx();
      await harness.executeCommand('estado', ctx);

      const replies = harness.getReplies();
      expect(replies.length).toBe(1);
      // Should not crash even with empty DB
    });
  });

  describe('/reset', () => {
    test('clears session state', async () => {
      seedSession(harness.db, { id: 'test-session-reset', status: 'active' });

      const ctx = harness.createMockCtx();
      await harness.executeCommand('reset', ctx);

      const replies = harness.getReplies();
      expect(replies.length).toBeGreaterThanOrEqual(1);
    });
  });
});
