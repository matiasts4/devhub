const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const { UiHeader } = require('../../src/components/ui/system/ui-header');

describe('UiHeader', () => {
  test('renders all slots in correct DOM order: breadcrumbs → title → tabs → actions', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        UiHeader,
        null,
        React.createElement(UiHeader.Breadcrumbs, null, 'Home / Page'),
        React.createElement(UiHeader.Title, null, 'Page Title'),
        React.createElement(UiHeader.Tabs, null, 'Tab1 Tab2'),
        React.createElement(UiHeader.Actions, null, 'Button')
      )
    );

    const breadcrumbsIndex = html.indexOf('Home / Page');
    const titleIndex = html.indexOf('Page Title');
    const tabsIndex = html.indexOf('Tab1 Tab2');
    const actionsIndex = html.indexOf('Button');

    expect(breadcrumbsIndex).toBeLessThan(titleIndex);
    expect(titleIndex).toBeLessThan(tabsIndex);
    expect(tabsIndex).toBeLessThan(actionsIndex);
  });

  test('missing slots render nothing', () => {
    const html = renderToStaticMarkup(
      React.createElement(UiHeader, null, React.createElement(UiHeader.Title, null, 'Only Title'))
    );

    expect(html).toContain('Only Title');
    expect(html).not.toContain('breadcrumbs');
    expect(html).not.toContain('tabs');
    expect(html).not.toContain('actions');
  });

  test('sticky prop adds sticky positioning classes', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        UiHeader,
        { sticky: true },
        React.createElement(UiHeader.Title, null, 'Sticky Title')
      )
    );

    expect(html).toContain('sticky');
    expect(html).toContain('top-0');
  });

  test('applies custom className', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        UiHeader,
        { className: 'custom-header' },
        React.createElement(UiHeader.Title, null, 'Title')
      )
    );

    expect(html).toContain('custom-header');
  });

  test('actions wrapper is absent when no actions slot provided', () => {
    const html = renderToStaticMarkup(
      React.createElement(UiHeader, null, React.createElement(UiHeader.Title, null, 'Title'))
    );

    const dom = new (require('jsdom').JSDOM)(html);
    const actionWrappers = dom.window.document.querySelectorAll('[class*="gap-2"]');
    expect(actionWrappers.length).toBe(0);
  });

  test('slot classNames are applied', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        UiHeader,
        null,
        React.createElement(UiHeader.Title, { className: 'title-custom' }, 'Title'),
        React.createElement(UiHeader.Actions, { className: 'actions-custom' }, 'Action')
      )
    );

    expect(html).toContain('title-custom');
    expect(html).toContain('actions-custom');
  });
});
