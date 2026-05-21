const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const HealthCenter = require('../../src/components/HealthCenter').default;

describe('HealthCenter', () => {
  test('renders authority, freshness and status reason for mixed health sources', () => {
    const html = renderToStaticMarkup(
      React.createElement(HealthCenter, {
        title: 'Estado operacional',
        sources: [
          {
            key: 'mcp',
            label: 'MCP',
            status: 'stale',
            authority: 'inferred',
            freshness_ms: 600000,
            status_reason: 'Using cached MCP status.',
          },
        ],
      })
    );

    expect(html).toContain('Estado operacional');
    expect(html).toContain('MCP');
    expect(html).toContain('Inferido');
    expect(html).toContain('10m');
    expect(html).toContain('Using cached MCP status.');
  });

  test('renders multiple canonical sources in one unified surface', () => {
    const html = renderToStaticMarkup(
      React.createElement(HealthCenter, {
        title: 'Estado operacional',
        sources: [
          {
            key: 'process',
            label: 'OpenCode Process',
            status: 'healthy',
            authority: 'authoritative',
            freshness_ms: 0,
          },
          {
            key: 'session-stream',
            label: 'Session Stream',
            status: 'degraded',
            authority: 'authoritative',
            freshness_ms: 30_000,
            status_reason: 'One or more sessions were marked stale or aborted.',
          },
        ],
      })
    );

    expect(html).toContain('2 fuentes canónicas');
    expect(html).toContain('OpenCode Process');
    expect(html).toContain('Session Stream');
    expect(html).toContain('Healthy');
    expect(html).toContain('Degraded');
  });
});
