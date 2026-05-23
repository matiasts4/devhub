const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const { UiShell } = require('../../src/components/ui/system/ui-shell');

describe('UiShell', () => {
  test('renders with Header, Sidebar, and Content slots', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        UiShell,
        null,
        React.createElement(UiShell.Header, null, 'Header Content'),
        React.createElement(UiShell.Sidebar, null, 'Sidebar Content'),
        React.createElement(UiShell.Content, null, 'Main Content')
      )
    );

    expect(html).toContain('Header Content');
    expect(html).toContain('Sidebar Content');
    expect(html).toContain('Main Content');
  });

  test('content pane has overflow-y-auto for scroll isolation', () => {
    const html = renderToStaticMarkup(
      React.createElement(UiShell, null, React.createElement(UiShell.Content, null, 'Main Content'))
    );

    expect(html).toContain('overflow-y-auto');
  });

  test('missing slots render nothing', () => {
    const html = renderToStaticMarkup(
      React.createElement(UiShell, null, React.createElement(UiShell.Content, null, 'Only Content'))
    );

    expect(html).not.toContain('header');
    expect(html).not.toContain('sidebar');
    expect(html).toContain('Only Content');
  });

  test('applies custom className to shell root', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        UiShell,
        { className: 'custom-shell' },
        React.createElement(UiShell.Content, null, 'Content')
      )
    );

    expect(html).toContain('custom-shell');
  });

  test('sidebar has flex-shrink-0 to remain fixed during content scroll', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        UiShell,
        null,
        React.createElement(UiShell.Sidebar, null, 'Sidebar'),
        React.createElement(UiShell.Content, null, 'Content')
      )
    );

    expect(html).toContain('flex-shrink-0');
  });
});
