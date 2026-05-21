jest.mock('../services/activityLogger', () => ({
  logAgentEvent: jest.fn(),
}));

jest.mock('../services/opencode', () => ({
  sendMessage: jest.fn(),
}));

jest.mock('../services/session-bridge', () => ({
  resolveSession: jest.fn(),
}));

const { MultiTurnExecutor } = require('../services/executor');

describe('MultiTurnExecutor', () => {
  function createExecutor() {
    const bot = {
      sendMessage: jest.fn().mockResolvedValue(undefined),
    };

    const db = {
      updateSessionStatus: jest.fn(),
      updateSessionTaskState: jest.fn(),
      getTelegramSession: jest.fn(),
      getSession: jest.fn(),
    };

    return { executor: new MultiTurnExecutor(bot, db), bot, db };
  }

  test('does not mark minimal no-tool output as completed', () => {
    const { executor } = createExecutor();
    const taskState = {
      turnCount: 0,
      toolsExecuted: new Map(),
    };

    const completed = executor._evaluateCompletion(taskState, 'Done.', []);

    expect(completed).toBe(false);
  });

  test('continuation prompt keeps the original objective and completion guardrails', () => {
    const { executor } = createExecutor();
    const taskState = {
      turnCount: 1,
      originalPrompt: 'Implementá el fix del Telegram bot y verificá el resultado real.',
    };

    const prompt = executor._buildContinuationPrompt(taskState, 'Avancé un poco.');

    expect(prompt).toContain('Objetivo original');
    expect(prompt).toContain(taskState.originalPrompt);
    expect(prompt).toContain('No marques la tarea como completa');
  });

  test('pauseTask pauses without requiring a reason argument', async () => {
    const { executor, bot, db } = createExecutor();
    const abort = jest.fn();

    executor.tasks.set('123', {
      chatId: '123',
      sessionId: 'session-1',
      agent: 'sdd-orchestrator',
      turnCount: 2,
      startedAt: new Date(Date.now() - 90_000),
      status: 'running',
      abortController: { abort },
      progressInterval: null,
    });

    const result = await executor.pauseTask('123');

    expect(abort).toHaveBeenCalled();
    expect(db.updateSessionStatus).toHaveBeenCalledWith('session-1', 'paused');
    expect(bot.sendMessage).toHaveBeenCalledWith(
      '123',
      expect.stringContaining('Ejecución pausada después de 2 turnos')
    );
    expect(result).toEqual(
      expect.objectContaining({
        chatId: '123',
        turnCount: 2,
      })
    );
  });
});
