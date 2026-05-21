const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const MCPStatusPanel = require('../../src/components/chat/MCPStatusPanel').default;

describe('MCPStatusPanel', () => {
  test('renders doctor, list-tools and smoke semantics without exposing unsafe actions', () => {
    const html = renderToStaticMarkup(
      React.createElement(MCPStatusPanel, {
        collapsed: false,
        snapshot: {
          observed_at: '2026-05-19T12:00:00.000Z',
          doctor: {
            probes: [
              {
                key: 'inventory',
                status: 'degraded',
                authority: 'configured',
                freshness: 'unknown',
                reason: 'OpenCode does not expose live MCP telemetry.',
                evidence: [{ kind: 'config', ref: 'mcp://filesystem', authority: 'configured' }],
              },
            ],
          },
          list_tools: {
            tools: [
              {
                name: 'list_projects',
                authority: 'durable',
                safe_action: true,
                control_plane: true,
                evidence: [{ kind: 'catalog', ref: 'devhub-mcp/server.js', authority: 'durable' }],
              },
              {
                name: 'read_file',
                authority: 'configured',
                safe_action: false,
                control_plane: false,
                reason: 'Fuera del control plane durable.',
                evidence: [{ kind: 'config', ref: 'mcp://filesystem', authority: 'configured' }],
              },
            ],
          },
          smoke: {
            status: 'degraded',
            checks: [
              {
                key: 'attach',
                status: 'unavailable',
                authority: 'configured',
                freshness: 'unknown',
                reason: 'GTK/VTE attach unavailable.',
                evidence: [],
              },
            ],
          },
        },
        onRefresh: () => {},
      })
    );

    expect(html).toContain('MCP Control Center');
    expect(html).toContain('inventory');
    expect(html).toContain('Configurado');
    expect(html).toContain('Unknown');
    expect(html).toContain('OpenCode does not expose live MCP telemetry.');
    expect(html).toContain('list_projects');
    expect(html).toContain('Fuera del control plane durable.');
    expect(html).not.toContain('Acción segura: read_file');
    expect(html).toContain('title="Refrescar"');
  });
});
