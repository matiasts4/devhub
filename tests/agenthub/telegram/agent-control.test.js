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
  let originalMultiTurn;
  let pauseAgent;
  let resumeAgent;

  beforeEach(async () => {
    originalMultiTurn = process.env.TELEGRAM_MULTI_TURN;
    process.env.TELEGRAM_MULTI_TURN = 'false';

    harness = new TelegramTestHarness({ lockOwner: 'telegram-agent-control' });
    await harness.setup();
    seedSwarmConfig(harness.db, 'max_concurrent', '5');

    pauseAgent = jest.fn();
    resumeAgent = jest.fn();

    harness.mockService('db', {
      getAgents: () => [],
      pauseAgent,
      resumeAgent,
      getProjectByName: () => null,
      getNextTask: () => null,
    });

    harness.mockService('api', {
      health: () => Promise.resolve(true),
      getProfiles: () => Promise.resolve([{ name: 'default' }]),
      launchAgent: () => Promise.resolve({ sessionId: 'test-spawn-session' }),
      executeAgent: () => Promise.resolve({ ok: true }),
      buildPrompt: () => Promise.resolve({ prompt: 'Mock prompt' }),
    });
  });

  afterEach(async () => {
    harness.restoreService('api');
    harness.restoreService('db');
    await harness.teardown();

    if (originalMultiTurn === undefined) {
      delete process.env.TELEGRAM_MULTI_TURN;
    } else {
      process.env.TELEGRAM_MULTI_TURN = originalMultiTurn;
    }
  });

  describe('/pausar', () => {
    test('changes agent status to paused', async () => {
      harness.mockService('db', {
        getAgents: () => [{ agent_id: 'agent-1', nombre: 'Agent Uno', status: 'working' }],
        pauseAgent,
        resumeAgent,
        getProjectByName: () => null,
        getNextTask: () => null,
      });

      const ctx = harness.createMockCtx();
      await harness.executeCommand('pausar', ctx, 'agent-1');

      const replies = harness.getReplies();
      expect(pauseAgent).toHaveBeenCalledWith('agent-1');
      expect(replies).toHaveLength(1);
      expect(replies[0].text).toContain('pausado correctamente');
    });

    test('shows success when there are no active agents', async () => {
      const ctx = harness.createMockCtx();
      await harness.executeCommand('pausar', ctx);

      const replies = harness.getReplies();
      expect(replies).toHaveLength(1);
      expect(replies[0].text).toContain('No hay agentes activos para pausar');
    });
  });

  describe('/reanudar', () => {
    test('resumes paused session', async () => {
      harness.mockService('db', {
        getAgents: () => [{ agent_id: 'agent-2', nombre: 'Agent Dos', status: 'paused' }],
        pauseAgent,
        resumeAgent,
        getProjectByName: () => null,
        getNextTask: () => null,
      });

      const ctx = harness.createMockCtx();
      await harness.executeCommand('reanudar', ctx, 'agent-2');

      const replies = harness.getReplies();
      expect(resumeAgent).toHaveBeenCalledWith('agent-2');
      expect(replies).toHaveLength(1);
      expect(replies[0].text).toContain('reanudado correctamente');
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
      const ctx = harness.createMockCtx();
      await harness.executeCommand('spawn', ctx, 'Implementar auth JWT');

      const replies = harness.getReplies();
      expect(replies.length).toBe(1);
      expect(replies[0].text).toContain('Implementar auth JWT');
    });

    test('shows error when Next.js is down', async () => {
      harness.mockService('api', {
        health: () => Promise.reject(new Error('Server down')),
        getProfiles: () => Promise.resolve([{ name: 'default' }]),
        launchAgent: () => Promise.resolve({ sessionId: 'unused' }),
        executeAgent: () => Promise.resolve({ ok: true }),
        buildPrompt: () => Promise.resolve({ prompt: 'unused' }),
      });

      const ctx = harness.createMockCtx();
      await harness.executeCommand('spawn', ctx, 'Some task');

      const replies = harness.getReplies();
      expect(replies.length).toBe(1);
      expect(replies[0].text).toContain('corriendo');
    });
  });

  describe('/continuar', () => {
    test('shows usage when project argument is missing', async () => {
      const ctx = harness.createMockCtx();
      await harness.executeCommand('continuar', ctx);

      const replies = harness.getReplies();
      expect(replies).toHaveLength(1);
      expect(replies[0].text).toContain('Uso: /continuar');
    });
  });
});
