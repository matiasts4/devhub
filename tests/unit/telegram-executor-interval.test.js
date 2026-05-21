/**
 * Unit tests for executor.js — progressIntervalMs env var configuration
 *
 * Tests that TELEGRAM_PROGRESS_INTERVAL_MS env var is respected when
 * creating the MultiTurnExecutor singleton via getExecutor().
 *
 * RED phase: Tests FAIL because default is 600_000 not 45_000.
 */

const {
  getExecutor,
  resetExecutor,
  MultiTurnExecutor,
} = require('../../telegram-bot/services/executor');

// ── Mock bot and db ─────────────────────────────────────────────────────────

function createMockBot() {
  return {
    sendMessage: jest.fn().mockResolvedValue({}),
    deleteMessage: jest.fn().mockResolvedValue({}),
  };
}

function createMockDb() {
  return {
    getTelegramSession: jest.fn().mockReturnValue(null),
    getSession: jest.fn().mockReturnValue(null),
    updateSessionStatus: jest.fn(),
    updateSessionTaskState: jest.fn(),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('executor.js — progressIntervalMs env var', () => {
  let bot;
  let db;

  beforeEach(() => {
    // Reset singleton and clean env var before each test
    resetExecutor();
    delete process.env.TELEGRAM_PROGRESS_INTERVAL_MS;
    bot = createMockBot();
    db = createMockDb();
  });

  afterEach(() => {
    resetExecutor();
    delete process.env.TELEGRAM_PROGRESS_INTERVAL_MS;
  });

  // ── Scenario: Env var not defined → default 45000 ─────────────────────────

  it('uses 45000ms default when TELEGRAM_PROGRESS_INTERVAL_MS is not set', () => {
    const executor = getExecutor(bot, db);

    expect(executor.options.progressIntervalMs).toBe(45_000);
  });

  // ── Scenario: Env var defined → use its value ─────────────────────────────

  it('uses 60000ms when TELEGRAM_PROGRESS_INTERVAL_MS="60000"', () => {
    process.env.TELEGRAM_PROGRESS_INTERVAL_MS = '60000';
    const executor = getExecutor(bot, db);

    expect(executor.options.progressIntervalMs).toBe(60_000);
  });

  it('uses 5000ms when TELEGRAM_PROGRESS_INTERVAL_MS="5000"', () => {
    process.env.TELEGRAM_PROGRESS_INTERVAL_MS = '5000';
    const executor = getExecutor(bot, db);

    expect(executor.options.progressIntervalMs).toBe(5_000);
  });

  // ── Scenario: Env var invalid → fallback to 45000 ────────────────────────

  it('falls back to 45000ms when TELEGRAM_PROGRESS_INTERVAL_MS="abc" (NaN)', () => {
    process.env.TELEGRAM_PROGRESS_INTERVAL_MS = 'abc';
    const executor = getExecutor(bot, db);

    expect(executor.options.progressIntervalMs).toBe(45_000);
  });

  it('falls back to 45000ms when TELEGRAM_PROGRESS_INTERVAL_MS="" (empty)', () => {
    process.env.TELEGRAM_PROGRESS_INTERVAL_MS = '';
    const executor = getExecutor(bot, db);

    expect(executor.options.progressIntervalMs).toBe(45_000);
  });

  // ── Singleton: env var read once at creation ───────────────────────────────

  it('respects progressIntervalMs option passed directly (override)', () => {
    const executor = getExecutor(bot, db, { progressIntervalMs: 99_000 });

    expect(executor.options.progressIntervalMs).toBe(99_000);
  });

  // ── Constructor: default accepts options override ─────────────────────────

  it('MultiTurnExecutor constructor still accepts explicit progressIntervalMs', () => {
    const executor = new MultiTurnExecutor(bot, db, { progressIntervalMs: 120_000 });

    expect(executor.options.progressIntervalMs).toBe(120_000);
  });
});
