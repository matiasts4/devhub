const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { JSDOM } = require('jsdom');

const { UiShell, UiHeader } = require('../../src/components/ui/system');

function MockWorkspaceLayout({ currentPage, hideHeader, children }) {
  return React.createElement(
    UiShell,
    { className: 'flex-col h-screen overflow-hidden' },
    !hideHeader &&
      React.createElement(
        UiShell.Header,
        null,
        React.createElement(UiHeader, null, React.createElement(UiHeader.Title, null, currentPage))
      ),
    React.createElement(
      'div',
      { className: 'flex flex-1 overflow-hidden' },
      React.createElement(UiShell.Sidebar, null, 'Sidebar'),
      React.createElement(UiShell.Content, null, children || 'Content')
    )
  );
}

describe('SPA Shell Adoption — WorkspaceLayout with UiShell', () => {
  test('renders UiShell with Header, Sidebar, and Content slots', () => {
    const html = renderToStaticMarkup(
      React.createElement(MockWorkspaceLayout, { currentPage: 'dashboard' })
    );

    expect(html).toContain('dashboard');
    expect(html).toContain('Sidebar');
    expect(html).toContain('Content');
  });

  test('renders route-specific header title for dashboard', () => {
    const html = renderToStaticMarkup(
      React.createElement(MockWorkspaceLayout, { currentPage: 'dashboard' })
    );
    expect(html).toContain('dashboard');
  });

  test('renders route-specific header title for tareas', () => {
    const html = renderToStaticMarkup(
      React.createElement(MockWorkspaceLayout, { currentPage: 'tareas' })
    );
    expect(html).toContain('tareas');
  });

  test('hides header on terminal route', () => {
    const html = renderToStaticMarkup(
      React.createElement(MockWorkspaceLayout, { currentPage: 'terminales', hideHeader: true })
    );
    expect(html).not.toContain('terminales');
    expect(html).not.toContain('<header');
  });

  test('scroll isolation: UiShell.Content has overflow-y-auto for main scroll', () => {
    const html = renderToStaticMarkup(
      React.createElement(MockWorkspaceLayout, { currentPage: 'dashboard' })
    );

    const dom = new JSDOM(html);
    const main = dom.window.document.querySelector('main');
    expect(main).not.toBeNull();
    expect(main.getAttribute('class')).toContain('overflow-y-auto');
  });
});
