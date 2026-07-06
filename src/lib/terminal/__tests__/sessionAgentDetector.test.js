const {
  ensureAgentDetectionSession,
  ingestAgentDetectionFromFilteredOutput,
} = require('../sessionAgentDetector.js');

describe('sessionAgentDetector', () => {
  test('kimi approval screen publishes blocked', () => {
    const session = ensureAgentDetectionSession({
      agentType: 'kimi',
      title: '',
      agentTuiState: null,
      agentTuiStateAt: null,
    });

    const chunk = ['run this command?', '↵ confirm', ' choose', 'approve   reject'].join('\n');

    const first = ingestAgentDetectionFromFilteredOutput(session, chunk, 1000);
    expect(first.agentTuiState).toBe('blocked');
    expect(first.published).not.toBeNull();

    const second = ingestAgentDetectionFromFilteredOutput(session, '\n', 1001);
    expect(second.agentTuiState).toBe('blocked');
  });

  test('two isolated sessions with same chunks get same state', () => {
    const chunk = ['run this command?', '↵ confirm', ' choose', 'approve   reject'].join('\n');

    const a = ensureAgentDetectionSession({ agentType: 'kimi', title: '' });
    const b = ensureAgentDetectionSession({ agentType: 'kimi', title: '' });

    ingestAgentDetectionFromFilteredOutput(a, chunk, 2000);
    ingestAgentDetectionFromFilteredOutput(b, chunk, 2000);

    expect(a.agentTuiState).toBe(b.agentTuiState);
    expect(a.agentTuiStateAt).toBe(b.agentTuiStateAt);
  });
});
