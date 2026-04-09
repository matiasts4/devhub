/**
 * TelegramTestHarness — Test harness for Telegram bot commands.
 *
 * Usage:
 *   const harness = new TelegramTestHarness();
 *   await harness.setup();
 *   const ctx = harness.createMockCtx({ chatId: '123' });
 *   const handler = harness.loadCommand('help');
 *   await handler(harness.mockBot, ctx.message, '');
 *   const replies = harness.getReplies();
 *   expect(replies.length).toBe(1);
 *   await harness.teardown();
 */

const path = require('path');
const { TestHarness } = require('../harness');
const { createMockTelegramCtx } = require('../mocks');

class TelegramTestHarness extends TestHarness {
  constructor(options = {}) {
    super({ dbPath: ':memory:', lockOwner: options.lockOwner || 'telegram-test' });
    this.mockBot = null;
    this._commandsDir = path.join(__dirname, '..', '..', '..', 'telegram-bot', 'commands');
    this._servicesDir = path.join(__dirname, '..', '..', '..', 'telegram-bot', 'services');
  }

  /**
   * Setup: create DB, mock bot, seed base data.
   */
  async setup() {
    this.setupDb();
    this.mockBot = this._createMockBot();
    return this;
  }

  /**
   * Teardown: close DB, clear mocks.
   */
  async teardown() {
    this.teardownDb();
    this.mockBot = null;
  }

  /**
   * Create a mock bot object with jest.fn()-style methods.
   */
  _createMockBot() {
    const mockFn = () => {
      const fn = (...args) => {
        fn.calls.push(args);
        fn.callCount++;
        return Promise.resolve({ ok: true });
      };
      fn.calls = [];
      fn.callCount = 0;
      return fn;
    };

    return {
      sendMessage: mockFn(),
      editMessageText: mockFn(),
      deleteMessage: mockFn(),
      answerCallbackQuery: mockFn(),
      sendPhoto: mockFn(),
      sendDocument: mockFn(),
      sendChatAction: mockFn(),
    };
  }

  /**
   * Create a mock Telegram context.
   */
  createMockCtx(options = {}) {
    return createMockTelegramCtx({
      chatId: options.chatId || 'test-chat-1',
      userId: options.userId || 'test-user-1',
      userName: options.userName || 'Test User',
      messageId: options.messageId || 1,
      message: options.message,
    });
  }

  /**
   * Load a command handler by name.
   * @param {string} name - Command name (e.g., 'help', 'estado', 'tareas')
   * @returns {Function} Command handler function
   */
  loadCommand(name) {
    const cmdPath = path.join(this._commandsDir, `${name}.js`);
    return require(cmdPath);
  }

  /**
   * Execute a command with a mock context.
   * @param {string} commandName - Command name
   * @param {object} ctx - Mock context (from createMockCtx)
   * @param {string} args - Command arguments string
   * @returns {Promise<any>} Handler result
   */
  async executeCommand(commandName, ctx, args = '') {
    const handler = this.loadCommand(commandName);
    return handler(this.mockBot, ctx.message, args);
  }

  /**
   * Get all sendMessage calls made by the bot.
   * @returns {Array<{chatId: string, text: string, options: object}>}
   */
  getReplies() {
    return this.mockBot.sendMessage.calls.map(([chatId, text, options]) => ({
      chatId,
      text,
      options,
    }));
  }

  /**
   * Get all editMessageText calls.
   */
  getEdits() {
    return this.mockBot.editMessageText.calls.map(([chatId, text, options]) => ({
      chatId,
      text,
      options,
    }));
  }

  /**
   * Assert that the last reply contains expected text.
   * @param {string} expectedText
   */
  assertReplyContains(expectedText) {
    const replies = this.getReplies();
    if (replies.length === 0) {
      throw new Error(`Expected reply containing "${expectedText}" but no replies were sent`);
    }
    const lastReply = replies[replies.length - 1];
    if (!lastReply.text.includes(expectedText)) {
      throw new Error(
        `Expected reply to contain "${expectedText}" but got: "${lastReply.text.substring(0, 200)}"`
      );
    }
    return lastReply;
  }

  /**
   * Assert that no replies were sent.
   */
  assertNoReply() {
    const replies = this.getReplies();
    if (replies.length > 0) {
      throw new Error(`Expected no replies but got ${replies.length}: ${JSON.stringify(replies)}`);
    }
  }

  /**
   * Assert reply count.
   */
  assertReplyCount(expected) {
    const replies = this.getReplies();
    if (replies.length !== expected) {
      throw new Error(
        `Expected ${expected} replies but got ${replies.length}: ${JSON.stringify(replies)}`
      );
    }
    return replies;
  }

  /**
   * Reset mock call history.
   */
  resetMockHistory() {
    Object.values(this.mockBot).forEach((fn) => {
      if (fn.calls) {
        fn.calls = [];
        fn.callCount = 0;
      }
    });
  }

  /**
   * Mock a service module.
   * @param {string} serviceName - Service name (e.g., 'api', 'db', 'formatter')
   * @param {object} mocks - Object with method names as keys and mock functions as values
   */
  mockService(serviceName, mocks) {
    const servicePath = path.join(this._servicesDir, `${serviceName}.js`);
    // Clear require cache
    delete require.cache[require.resolve(servicePath)];
    // Create mock
    const mockModule = {};
    for (const [key, value] of Object.entries(mocks)) {
      mockModule[key] = typeof value === 'function' ? value : () => value;
    }
    require.cache[servicePath] = {
      id: servicePath,
      filename: servicePath,
      loaded: true,
      exports: mockModule,
    };
    return mockModule;
  }

  /**
   * Restore a service module (remove mock).
   */
  restoreService(serviceName) {
    const servicePath = path.join(this._servicesDir, `${serviceName}.js`);
    delete require.cache[require.resolve(servicePath)];
  }
}

module.exports = { TelegramTestHarness };
