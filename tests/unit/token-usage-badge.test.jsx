const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const TokenUsageBadge = require('../../src/components/chat/TokenUsageBadge').default;

describe('TokenUsageBadge', () => {
  test('renders percentage and token counts for the compact context bar widget', () => {
    const html = renderToStaticMarkup(
      React.createElement(TokenUsageBadge, {
        usage: {
          prompt_tokens: 1200,
          completion_tokens: 3800,
          total_tokens: 5000,
          context_window_size: 200000,
          context_utilization: 2.5,
          model: 'gpt-4o',
        },
        compact: true,
      })
    );

    expect(html).toContain('2.5%');
    expect(html).toContain('5.0k / 200.0k');
    expect(html).toContain('aria-label="Context usage: 5,000 of 200,000 tokens used (2.5%)"');
    expect(html).toContain(
      'title="Model gpt-4o · Prompt 1,200 · Completion 3,800 · Total 5,000 / 200,000 tokens"'
    );
  });

  test('surfaces danger state copy when context utilization is high', () => {
    const html = renderToStaticMarkup(
      React.createElement(TokenUsageBadge, {
        usage: {
          prompt_tokens: 70000,
          completion_tokens: 100000,
          total_tokens: 170000,
          context_window_size: 200000,
          context_utilization: 85,
        },
      })
    );

    expect(html).toContain('85.0%');
    expect(html).toContain('Riesgo alto');
    expect(html).toContain('170,000 / 200,000');
  });

  test('prefers the display model label when transport model differs', () => {
    const html = renderToStaticMarkup(
      React.createElement(TokenUsageBadge, {
        usage: {
          prompt_tokens: 6400,
          completion_tokens: 1600,
          total_tokens: 8000,
          display_model: 'GPT-5.4 mini',
          transport_model: 'gpt-4o-mini',
        },
      })
    );

    expect(html).toContain('8,000 / 128,000');
    expect(html).toContain('title="Model GPT-5.4 mini');
  });
});
