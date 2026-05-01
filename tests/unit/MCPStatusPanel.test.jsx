const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const MCPStatusPanel = require('../../src/components/chat/MCPStatusPanel').default;

describe('MCPStatusPanel', () => {
  test('renders canonical authority and freshness metadata for inferred servers', () => {
    const html = renderToStaticMarkup(
      React.createElement(MCPStatusPanel, {
        collapsed: false,
        servers: [
          {
            name: 'filesystem',
            status: 'connected',
            authority: 'inferred',
            freshness: 'stale',
            status_reason: 'OpenCode does not expose live MCP telemetry.',
            tools: [{ name: 'read_file', description: 'Read files' }],
          },
        ],
        onRefresh: () => {},
      })
    );

    expect(html).toContain('filesystem');
    expect(html).toContain('Inferido');
    expect(html).toContain('Stale');
    expect(html).toContain('OpenCode does not expose live MCP telemetry.');
    expect(html).toContain('title="Refrescar"');
  });
});
