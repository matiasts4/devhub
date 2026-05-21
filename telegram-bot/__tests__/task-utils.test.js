const { classifyTaskIntent, shouldUseMultiTurn } = require('../utils/task');

describe('telegram task classification', () => {
  test('treats simple file inspection prompts as single-turn', () => {
    const prompt = 'podrías realizar un ls e indicarme los archivos en este directorio';
    const classification = classifyTaskIntent(prompt);

    expect(classification.intent).toBe('direct-command');
    expect(classification.shouldUseMultiTurn).toBe(false);
    expect(shouldUseMultiTurn(prompt)).toBe(false);
  });

  test('routes complex implementation work to multi-turn', () => {
    const prompt =
      'Implementá un fix en el executor, refactorizá la lógica duplicada y continuá hasta dejar tests cubriendo el flujo completo.';

    const classification = classifyTaskIntent(prompt);

    expect(classification.intent).toBe('autonomous-task');
    expect(classification.shouldUseMultiTurn).toBe(true);
    expect(shouldUseMultiTurn(prompt)).toBe(true);
  });
});
