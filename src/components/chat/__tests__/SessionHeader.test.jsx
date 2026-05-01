import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import SessionHeader from '../SessionHeader.jsx';

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
    <SessionHeader
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

describe('SessionHeader compression action', () => {
  test('renders a clear compression action when enough history exists', () => {
    const html = renderHeader();

    expect(html).toContain('Comprimir');
    expect(html).toContain('title="Comprimir historial anterior"');
    expect(html).not.toContain('disabled=""');
    expect(html).not.toContain('Contexto');
  });

  test('disables the action with explanatory copy while compression is unavailable or busy', () => {
    const shortHistoryHtml = renderHeader({ messagesCount: 4 });
    expect(shortHistoryHtml).toContain('title="Se necesitan al menos 5 mensajes para comprimir"');
    expect(shortHistoryHtml).toContain('disabled=""');

    const busyHtml = renderHeader({ isCompressing: true });
    expect(busyHtml).toContain('Comprimiendo');
    expect(busyHtml).toContain('aria-busy="true"');
    expect(busyHtml).toContain('disabled=""');
  });
});
