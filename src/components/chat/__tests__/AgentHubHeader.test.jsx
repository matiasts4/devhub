import AgentHubHeader from '../AgentHubHeader.jsx';
import { renderToStaticMarkup } from 'react-dom/server';

jest.mock('@/components/ui/dropdown-menu', () => {
  const React = require('react');
  const passthrough = ({ children, ...props }) => React.createElement('div', props, children);
  return {
    DropdownMenu: passthrough,
    DropdownMenuContent: passthrough,
    DropdownMenuItem: ({ children, ...props }) => React.createElement('button', props, children),
    DropdownMenuLabel: passthrough,
    DropdownMenuSeparator: (props) => React.createElement('hr', props),
    DropdownMenuTrigger: ({ children }) => React.createElement(React.Fragment, null, children),
  };
});

function renderHeader(props = {}) {
  return renderToStaticMarkup(
    <AgentHubHeader
      currentSession={{ title: 'Sesión actual' }}
      sessions={[]}
      currentSessionId="session-1"
      showMCPPanel={false}
      isCompressing={false}
      messagesCount={6}
      onToggleMCP={() => {}}
      onCompress={() => {}}
      onLoadSession={() => {}}
      onDeleteSession={() => {}}
      onCreateSession={() => {}}
      {...props}
    />
  );
}

describe('AgentHubHeader UiHeader composition', () => {
  test('renders title with Agent Hub branding and session name', () => {
    const html = renderHeader();
    expect(html).toContain('Agent Hub');
    expect(html).toContain('Sesión actual');
  });

  test('renders MCP toggle button in actions', () => {
    const html = renderHeader();
    expect(html).toContain('title="MCP Servers"');
    expect(html).toContain('aria-pressed="false"');
  });

  test('renders compression action when enough history exists', () => {
    const html = renderHeader();
    expect(html).toContain('Comprimir');
    expect(html).toContain('title="Comprimir historial anterior"');
    expect(html).not.toContain('disabled=""');
  });

  test('disables compression action when history is short or busy', () => {
    const shortHtml = renderHeader({ messagesCount: 4 });
    expect(shortHtml).toContain('title="Se necesitan al menos 5 mensajes para comprimir"');
    expect(shortHtml).toContain('disabled=""');

    const busyHtml = renderHeader({ isCompressing: true });
    expect(busyHtml).toContain('Comprimiendo');
    expect(busyHtml).toContain('aria-busy="true"');
    expect(busyHtml).toContain('disabled=""');
  });

  test('renders sessions dropdown and new session button', () => {
    const html = renderHeader();
    expect(html).toContain('title="Historial de sesiones"');
    expect(html).toContain('title="Nueva Conversación"');
  });

  test('MCP toggle reflects active state', () => {
    const html = renderHeader({ showMCPPanel: true });
    expect(html).toContain('aria-pressed="true"');
  });

  test('renders sessions list inside dropdown when sessions exist', () => {
    const html = renderHeader({
      sessions: [
        { id: 's1', title: 'Sesión 1', updated_at: '2026-05-20T10:00:00Z' },
        { id: 's2', title: 'Sesión 2', updated_at: '2026-05-21T12:00:00Z' },
      ],
    });
    expect(html).toContain('Sesión 1');
    expect(html).toContain('Sesión 2');
    expect(html).toContain('Nueva Conversación');
  });
});
