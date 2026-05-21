/**
 * Mock Utilities for AgentHub Testing
 *
 * Provides mock implementations for external dependencies:
 * - In-memory database with seeded data
 * - OpenCode spawn mocking
 * - LLM API fetch interception
 * - Telegram context mocking
 */

const { createTestDb } = require('../../lib/test-schema');

/**
 * Create an in-memory database with optional seeded data.
 *
 * @param {object} [options]
 * @param {boolean} [options.seedBasic] - Seed with minimal test data (default: false)
 * @param {Array<object>} [options.seedProjects] - Array of project objects to insert
 * @param {Array<object>} [options.seedTasks] - Array of task objects to insert
 * @returns {import('better-sqlite3').Database}
 */
function createMockDb(options = {}) {
  const db = createTestDb();

  if (options.seedBasic) {
    // Insert a basic test project
    db.prepare(
      `INSERT OR IGNORE INTO projects (id, name, description, status, created_at)
       VALUES ('test-project-1', 'Test Project', 'A project for testing', 'active', datetime('now'))`
    ).run();

    // Insert a basic test task
    db.prepare(
      `INSERT OR IGNORE INTO tasks (id, project_id, title, description, status, priority, created_at)
       VALUES ('test-task-1', 'test-project-1', 'Test Task', 'A task for testing', 'pending', 'medium', datetime('now'))`
    ).run();
  }

  if (options.seedProjects && options.seedProjects.length > 0) {
    const stmt = db.prepare(
      `INSERT OR IGNORE INTO projects (id, name, description, status, created_at)
       VALUES (@id, @name, @description, @status, datetime('now'))`
    );
    const insertMany = db.transaction((projects) => {
      for (const p of projects) {
        stmt.run({
          id: p.id,
          name: p.name,
          description: p.description || null,
          status: p.status || 'active',
        });
      }
    });
    insertMany(options.seedProjects);
  }

  if (options.seedTasks && options.seedTasks.length > 0) {
    const stmt = db.prepare(
      `INSERT OR IGNORE INTO tasks (id, project_id, title, description, status, priority, created_at)
       VALUES (@id, @project_id, @title, @description, @status, @priority, datetime('now'))`
    );
    const insertMany = db.transaction((tasks) => {
      for (const t of tasks) {
        stmt.run({
          id: t.id,
          project_id: t.project_id,
          title: t.title,
          description: t.description || null,
          status: t.status || 'pending',
          priority: t.priority || 'medium',
        });
      }
    });
    insertMany(options.seedTasks);
  }

  return db;
}

/**
 * Mock child_process.spawn for OpenCode interactions.
 *
 * Returns a mock spawn function that returns a controlled EventEmitter-like
 * object with configurable stdout, stderr, exit code, and error behavior.
 *
 * @param {object} [options]
 * @param {string} [options.stdout] - Simulated stdout output
 * @param {string} [options.stderr] - Simulated stderr output
 * @param {number} [options.exitCode] - Simulated exit code (default: 0)
 * @param {Error} [options.error] - Simulated spawn error
 * @param {number} [options.delay] - Delay in ms before emitting events (default: 0)
 * @returns {Function} Mock spawn function
 */
function mockOpenCodeSpawn(options = {}) {
  const { stdout = '', stderr = '', exitCode = 0, error = null, delay = 0 } = options;

  const calls = [];

  function spawn(command, args = [], spawnOptions = {}) {
    calls.push({ command, args, options: spawnOptions });

    const EventEmitter = require('events');
    const mock = new EventEmitter();

    mock.stdout = new EventEmitter();
    mock.stderr = new EventEmitter();
    mock.pid = 12345 + calls.length;

    setTimeout(() => {
      if (error) {
        mock.emit('error', error);
        return;
      }

      if (stdout) {
        mock.stdout.emit('data', Buffer.from(stdout));
      }
      if (stderr) {
        mock.stderr.emit('data', Buffer.from(stderr));
      }

      mock.emit('close', exitCode);
    }, delay);

    return mock;
  }

  spawn.calls = calls;
  spawn.reset = () => {
    calls.length = 0;
  };

  return spawn;
}

/**
 * Mock fetch for LLM API calls.
 *
 * Returns a jest.fn() (or plain function if jest not available) that
 * intercepts fetch calls and returns configurable responses.
 *
 * @param {object} [options]
 * @param {object} [options.response] - Default response body (default: { choices: [] })
 * @param {number} [options.status] - Default HTTP status (default: 200)
 * @param {Error} [options.error] - Simulated fetch error
 * @param {number} [options.delay] - Delay in ms before resolving (default: 0)
 * @returns {Function} Mock fetch function
 */
function mockLlmFetch(options = {}) {
  const {
    response = { choices: [{ message: { role: 'assistant', content: 'Mock response' } }] },
    status = 200,
    error = null,
    delay = 0,
  } = options;

  const calls = [];
  let currentResponse = response;
  let currentStatus = status;
  let currentError = error;

  // Queue of responses for sequential calls
  const responseQueue = [];

  function mockFetch(url, fetchOptions = {}) {
    calls.push({ url, options: fetchOptions });

    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (currentError) {
          reject(currentError);
          return;
        }

        // Check if there's a queued response
        let resp = currentResponse;
        let st = currentStatus;
        if (responseQueue.length > 0) {
          const queued = responseQueue.shift();
          resp = queued.response || resp;
          st = queued.status != null ? queued.status : st;
        }

        resolve({
          ok: st >= 200 && st < 300,
          status: st,
          statusText: st === 200 ? 'OK' : 'Error',
          json: () => Promise.resolve(resp),
          text: () => Promise.resolve(JSON.stringify(resp)),
          headers: new Map([['content-type', 'application/json']]),
        });
      }, delay);
    });
  }

  mockFetch.calls = calls;
  mockFetch.reset = () => {
    calls.length = 0;
    responseQueue.length = 0;
    currentResponse = response;
    currentStatus = status;
    currentError = error;
  };

  /**
   * Queue a response for the next fetch call.
   * @param {object} resp
   * @param {object} [resp.response] - Response body
   * @param {number} [resp.status] - HTTP status
   */
  mockFetch.queueResponse = (resp) => {
    responseQueue.push(resp);
  };

  /**
   * Set the default response for all subsequent calls.
   */
  mockFetch.setDefaultResponse = (resp, st = 200) => {
    currentResponse = resp;
    currentStatus = st;
  };

  /**
   * Set an error to be thrown on the next call.
   */
  mockFetch.setError = (err) => {
    currentError = err;
  };

  return mockFetch;
}

/**
 * Create a mock Telegram context (ctx) for testing Telegram bot handlers.
 *
 * All methods are jest.fn() mocks (or plain functions if jest is not available).
 *
 * @param {object} [options]
 * @param {string} [options.chatId] - Chat ID (default: 'test-chat-1')
 * @param {string} [options.userId] - User ID (default: 'test-user-1')
 * @param {string} [options.userName] - User name (default: 'Test User')
 * @param {number} [options.messageId] - Message ID (default: 1)
 * @param {object} [options.message] - Full message object override
 * @param {object} [options.callbackQuery] - Callback query object
 * @returns {object} Mock Telegram ctx
 */
function createMockTelegramCtx(options = {}) {
  const {
    chatId = 'test-chat-1',
    userId = 'test-user-1',
    userName = 'Test User',
    messageId = 1,
    message = null,
    callbackQuery = null,
  } = options;

  const fn = (...args) => {
    fn.calls.push(args);
    fn.callCount++;
    return Promise.resolve({ ok: true });
  };
  fn.calls = [];
  fn.callCount = 0;
  fn.mockResolvedValue = function (value) {
    this._mockValue = value;
    return this;
  };
  fn.mockReturnValue = function (value) {
    this._mockReturnValue = value;
    return this;
  };
  fn.mockImplementation = function (impl) {
    this._mockImpl = impl;
    return this;
  };
  fn.mockRejectedValue = function (err) {
    this._mockReject = err;
    return this;
  };

  function createMockFn() {
    const mock = (...args) => {
      mock.calls.push(args);
      mock.callCount++;
      if (mock._mockReject) {
        return Promise.reject(mock._mockReject);
      }
      if (mock._mockImpl) {
        return Promise.resolve(mock._mockImpl(...args));
      }
      if (mock._mockReturnValue !== undefined) {
        return mock._mockReturnValue;
      }
      return Promise.resolve(mock._mockValue !== undefined ? mock._mockValue : { ok: true });
    };
    mock.calls = [];
    mock.callCount = 0;
    mock._mockValue = { ok: true };
    mock.mockResolvedValue = function (value) {
      this._mockValue = value;
      return this;
    };
    mock.mockReturnValue = function (value) {
      this._mockReturnValue = value;
      return this;
    };
    mock.mockImplementation = function (impl) {
      this._mockImpl = impl;
      return this;
    };
    mock.mockRejectedValue = function (err) {
      this._mockReject = err;
      return this;
    };
    return mock;
  }

  const reply = createMockFn();
  const editMessageText = createMockFn();
  const deleteMessage = createMockFn();
  const answerCallbackQuery = createMockFn();
  const sendMessage = createMockFn();
  const editMessageReplyMarkup = createMockFn();
  const answerInlineQuery = createMockFn();
  const sendPhoto = createMockFn();
  const sendDocument = createMockFn();
  const sendChatAction = createMockFn();

  const ctx = {
    chat: { id: chatId },
    from: { id: userId, username: userName, first_name: userName },
    message: message || {
      chat: { id: chatId },
      from: { id: userId, username: userName },
      message_id: messageId,
      text: '/start',
      date: Math.floor(Date.now() / 1000),
    },
    callbackQuery: callbackQuery || null,
    updateId: 1,

    // Methods
    reply,
    editMessageText,
    deleteMessage,
    answerCallbackQuery,
    sendMessage,
    editMessageReplyMarkup,
    answerInlineQuery,
    sendPhoto,
    sendDocument,
    sendChatAction,

    // Convenience: get all calls across all methods
    getAllCalls() {
      return {
        reply: reply.calls,
        editMessageText: editMessageText.calls,
        deleteMessage: deleteMessage.calls,
        answerCallbackQuery: answerCallbackQuery.calls,
        sendMessage: sendMessage.calls,
        editMessageReplyMarkup: editMessageReplyMarkup.calls,
      };
    },

    // Reset all mock call history
    resetHistory() {
      [
        reply,
        editMessageText,
        deleteMessage,
        answerCallbackQuery,
        sendMessage,
        editMessageReplyMarkup,
        answerInlineQuery,
        sendPhoto,
        sendDocument,
        sendChatAction,
      ].forEach((fn) => {
        fn.calls = [];
        fn.callCount = 0;
      });
    },
  };

  return ctx;
}

module.exports = {
  createMockDb,
  mockOpenCodeSpawn,
  mockLlmFetch,
  createMockTelegramCtx,
};
