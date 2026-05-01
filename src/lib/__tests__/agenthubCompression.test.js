import {
  DEFAULT_COMPRESSION_KEEP_LAST_N,
  MIN_MESSAGES_FOR_COMPRESSION,
  formatCompressionResultMessage,
  planMessageCompression,
} from '../agenthubCompression.js';

describe('agenthubCompression helpers', () => {
  test('plans compression while preserving the most recent messages', () => {
    const messages = Array.from({ length: 6 }, (_, index) => ({
      id: `message-${index + 1}`,
      content: `Contenido ${index + 1} ${'x'.repeat(20)}`,
    }));

    const plan = planMessageCompression(messages, 2);

    expect(plan.canCompress).toBe(true);
    expect(plan.toCompress.map((message) => message.id)).toEqual([
      'message-1',
      'message-2',
      'message-3',
      'message-4',
    ]);
    expect(plan.keptMessages.map((message) => message.id)).toEqual(['message-5', 'message-6']);
    expect(plan.keep_last_n).toBe(2);
  });

  test('returns a no-op plan with zero savings when history is too short', () => {
    const messages = Array.from({ length: MIN_MESSAGES_FOR_COMPRESSION - 1 }, (_, index) => ({
      id: `message-${index + 1}`,
      content: `Mensaje ${index + 1}`,
    }));

    const plan = planMessageCompression(messages, DEFAULT_COMPRESSION_KEEP_LAST_N);

    expect(plan.canCompress).toBe(false);
    expect(plan.tokens_saved).toBe(0);
    expect(plan.reason).toMatch(/No hay suficientes mensajes/i);
  });

  test('formats success feedback with concrete compression results', () => {
    const message = formatCompressionResultMessage({
      compressed: true,
      messages_compressed: 6,
      tokens_saved: 320,
      token_reduction_ratio: 0.4,
    });

    expect(message).toContain('6 mensajes resumidos');
    expect(message).toContain('320 tokens ahorrados');
    expect(message).toContain('40% menos contexto');
  });
});
