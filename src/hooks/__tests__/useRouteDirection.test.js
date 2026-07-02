/**
 * @jest-environment jsdom
 */

'use strict';

const React = require('react');
const { createRoot } = require('react-dom/client');
const { act } = require('react');

const mockUseLocation = jest.fn();
const mockUseNavigationType = jest.fn();

jest.mock('react-router-dom', () => ({
  useLocation: () => mockUseLocation(),
  useNavigationType: () => mockUseNavigationType(),
}));

function installDom() {
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://devhub.test',
  });
  global.window = dom.window;
  global.document = dom.window.document;
  global.IS_REACT_ACT_ENVIRONMENT = true;
  return dom;
}

function DirectionReader() {
  const { useRouteDirection } = require('../useRouteDirection');
  const direction = useRouteDirection();
  return React.createElement('span', { 'data-testid': 'direction' }, direction);
}

function renderWithPath(pathname, navigationType) {
  mockUseLocation.mockReturnValue({ pathname });
  mockUseNavigationType.mockReturnValue(navigationType);
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(React.createElement(DirectionReader));
  });
  return {
    container,
    unmount: () => act(() => root.unmount()),
    update: (newPathname, newType) => {
      mockUseLocation.mockReturnValue({ pathname: newPathname });
      mockUseNavigationType.mockReturnValue(newType);
      act(() => {
        root.render(React.createElement(DirectionReader));
      });
    },
  };
}

describe('useRouteDirection', () => {
  let dom;

  beforeEach(() => {
    dom = installDom();
    mockUseLocation.mockReset();
    mockUseNavigationType.mockReset();
  });

  afterEach(() => {
    if (dom) dom.window.close();
  });

  test('initial navigation defaults to forward', () => {
    const { container, unmount } = renderWithPath('/project/1/dashboard', 'PUSH');
    expect(container.querySelector('[data-testid="direction"]').textContent).toBe('forward');
    unmount();
  });

  test('PUSH navigation reports forward', () => {
    const { container, unmount, update } = renderWithPath('/project/1/dashboard', 'PUSH');
    update('/project/1/tareas', 'PUSH');
    expect(container.querySelector('[data-testid="direction"]').textContent).toBe('forward');
    unmount();
  });

  test('POP navigation reports back', () => {
    const { container, unmount, update } = renderWithPath('/project/1/dashboard', 'PUSH');
    update('/project/1/tareas', 'PUSH');
    update('/project/1/dashboard', 'POP');
    expect(container.querySelector('[data-testid="direction"]').textContent).toBe('back');
    unmount();
  });

  test('REPLACE navigation keeps the previous direction', () => {
    const { container, unmount, update } = renderWithPath('/project/1/dashboard', 'PUSH');
    update('/project/1/tareas', 'PUSH');
    update('/project/1/dashboard', 'POP');
    update('/project/1/dashboard?tab=general', 'REPLACE');
    expect(container.querySelector('[data-testid="direction"]').textContent).toBe('back');
    unmount();
  });

  test('POP to an arbitrary earlier path still reports back', () => {
    const { container, unmount, update } = renderWithPath('/project/1/dashboard', 'PUSH');
    update('/project/1/tareas', 'PUSH');
    update('/project/1/editor', 'PUSH');
    update('/project/1/dashboard', 'POP');
    expect(container.querySelector('[data-testid="direction"]').textContent).toBe('back');
    unmount();
  });
});
