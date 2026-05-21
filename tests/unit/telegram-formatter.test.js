const {
  formatHelp,
  formatCommandQuarantined,
} = require('../../telegram-bot/services/formatter');

describe('telegram formatter adapter-safe output', () => {
  it('removes legacy orchestration commands from help output', () => {
    const text = formatHelp();

    expect(text).toContain('/estado');
    expect(text).toContain('/agente — Ver agente actual');
    expect(text).toContain('cuarentena');
    expect(text).not.toContain('/spawn \\[tarea\\]');
    expect(text).not.toContain('/continuar \\[proyecto\\]');
    expect(text).not.toContain('/agente \\[nombre\\]');
  });

  it('renders quarantine replies with durable audit refs', () => {
    const text = formatCommandQuarantined('spawn', {
      intent_id: 'intent-1',
      result_ref: 'telegram-intent://result-1',
    });

    expect(text).toContain('Fuera de alcance');
    expect(text).toContain('intent\\-1');
    expect(text).toContain('telegram\\-intent://result\\-1');
  });
});
