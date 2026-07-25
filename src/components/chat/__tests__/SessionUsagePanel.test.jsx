import SessionUsagePanel from '../SessionUsagePanel.jsx';
import { renderToStaticMarkup } from 'react-dom/server';

describe('SessionUsagePanel', () => {
  test('renders the token usage widget in its own dedicated panel below the header', () => {
    const html = renderToStaticMarkup(
      <SessionUsagePanel
        usage={{
          prompt_tokens: 1200,
          completion_tokens: 3800,
          total_tokens: 5000,
          context_window_size: 128000,
          context_utilization: 3.9,
          model: 'gpt-4o',
        }}
      />
    );

    expect(html).toContain('Uso de contexto');
    expect(html).toContain('5,000 / 128,000 tokens');
    expect(html).toContain('Context usage: 5,000 of 128,000 tokens used (3.9%)');
  });

  test('renders nothing when there is no token usage yet', () => {
    expect(renderToStaticMarkup(<SessionUsagePanel usage={null} />)).toBe('');
    expect(
      renderToStaticMarkup(
        <SessionUsagePanel usage={{ prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }} />
      )
    ).toBe('');
  });
});
