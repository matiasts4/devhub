/**
 * TelegramTestHarness — Test harness for Telegram bot commands.
 *
 * Usage:
 *   const harness = new TelegramTestHarness();
 *   await harness.setup();
 *   const ctx = harness.createMockCtx({ chatId: '123' });
 *   await harness.executeCommand('help', ctx, '');
 *   const replies = harness.getReplies();
 *   expect(replies.length).toBe(1);
 *   await harness.teardown();
 *
 * Mock isolation strategy:
 *   - jest.resetModules() clears Jest's internal module registry
 *   - jest.setMock(path, mock) registers a mock in Jest's module registry
 *   - mockServices(map) batches all mocks (single resetModules call)
 *   - loadCommand() always calls jest.resetModules() + require() fresh
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
    this._libDir = path.join(__dirname, '..', '..', '..', 'telegram-bot', 'lib');
    this._activeMocks = {}; // serviceName -> absolute path
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
    // Clean up all active mocks
    for (const servicePath of Object.values(this._activeMocks)) {
      jest.unmock(servicePath);
    }
    this._activeMocks = {};
    jest.resetModules();
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
   * Resolve the absolute path for a service name.
   * Supports:
   *   - 'db'            → telegram-bot/services/db.js
   *   - 'api'           → telegram-bot/services/api.js
   *   - 'lib/db-bridge' → telegram-bot/lib/db-bridge.js
   */
  _resolveServicePath(serviceName) {
    if (serviceName.startsWith('lib/')) {
      const libName = serviceName.slice(4); // strip 'lib/'
      return path.join(this._libDir, `${libName}.js`);
    }
    return path.join(this._servicesDir, `${serviceName}.js`);
  }

  /**
   * Mock a single service module using Jest's module registry.
   * NOTE: Calls jest.resetModules() — clears previously registered mocks.
   * Use mockServices() when mocking multiple services at once.
   *
   * @param {string} serviceName - Service name (e.g., 'api', 'db', 'lib/db-bridge')
   * @param {object} mocks - Methods to mock on the service
   */
  mockService(serviceName, mocks) {
    const servicePath = this._resolveServicePath(serviceName);
    const mockModule = {};
    for (const [key, value] of Object.entries(mocks)) {
      mockModule[key] = typeof value === 'function' ? value : () => value;
    }

    jest.setMock(servicePath, mockModule);
    this._activeMocks[serviceName] = servicePath;
    return mockModule;
  }

  /**
   * Mock multiple services at once.
   * Equivalent to calling mockService() for each entry, but batched.
   *
   * @param {object} servicesMap - { serviceName: mocksObject, ... }
   */
  mockServices(servicesMap) {
    for (const [serviceName, mocks] of Object.entries(servicesMap)) {
      this.mockService(serviceName, mocks);
    }
  }

  /**
   * Restore a mocked service (remove mock from Jest's registry).
   * @param {string} serviceName
   */
  restoreService(serviceName) {
    const servicePath = this._resolveServicePath(serviceName);
    jest.unmock(servicePath);
    delete this._activeMocks[serviceName];
  }

  /**
   * Load a command handler by name.
   * Clears the command AND all actively-mocked services from require.cache
   * so that when the command is re-required it picks up jest.setMock() mocks.
   *
   * @param {string} name - Command name (e.g., 'help', 'estado', 'tareas')
   * @returns {Function} Command handler function
   */
  loadCommand(name) {
    const cmdPath = path.join(this._commandsDir, `${name}.js`);

    // Remove command from cache so it re-executes its top-level requires
    try {
      delete require.cache[require.resolve(cmdPath)];
    } catch (_) {}

    // Remove all mocked services from cache so require() will hit jest.setMock registry
    for (const servicePath of Object.values(this._activeMocks)) {
      try {
        delete require.cache[require.resolve(servicePath)];
      } catch (_) {}
    }

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
}

module.exports = { TelegramTestHarness };
