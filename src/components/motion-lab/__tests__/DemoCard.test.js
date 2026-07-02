'use strict';

const React = require('react');
const { createRoot } = require('react-dom/client');
const { flushSync } = require('react-dom');
const { JSDOM } = require('jsdom');

function installDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://devhub.test/project/1/motion-lab',
  });
  global.window = dom.window;
  global.document = dom.window.document;
  global.navigator = dom.window.navigator;
  global.HTMLElement = dom.window.HTMLElement;
  return dom;
}

function render(element) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  flushSync(() => root.render(element));
  return { container, root };
}

describe('DemoCard', () => {
  let dom;
  afterEach(() => {
    if (dom) dom.window.close();
  });

  test('passes isReduced to the render prop', () => {
    dom = installDom();
    const { DemoCard } = require('../DemoCard');
    const renderProp = jest.fn(() => React.createElement('div', null, 'demo'));
    render(
      React.createElement(DemoCard, {
        index: 1,
        title: 'Test',
        description: 'desc',
        config: 'cfg',
        render: renderProp,
        vote: null,
        onVote: jest.fn(),
        isReduced: true,
      })
    );
    expect(renderProp).toHaveBeenCalled();
    const call = renderProp.mock.calls[renderProp.mock.calls.length - 1][0];
    expect(call.isReduced).toBe(true);
  });

  test('calls onVote with like', () => {
    dom = installDom();
    const { DemoCard } = require('../DemoCard');
    const onVote = jest.fn();
    const { container } = render(
      React.createElement(DemoCard, {
        index: 1,
        title: 'Test',
        description: 'desc',
        config: 'cfg',
        render: () => React.createElement('div', null, 'demo'),
        vote: null,
        onVote,
        isReduced: false,
      })
    );
    const likeButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('like')
    );
    expect(likeButton).not.toBeNull();
    flushSync(() => likeButton.click());
    expect(onVote).toHaveBeenCalledWith('like');
  });

  test('calls onVote with dislike', () => {
    dom = installDom();
    const { DemoCard } = require('../DemoCard');
    const onVote = jest.fn();
    const { container } = render(
      React.createElement(DemoCard, {
        index: 1,
        title: 'Test',
        description: 'desc',
        config: 'cfg',
        render: () => React.createElement('div', null, 'demo'),
        vote: null,
        onVote,
        isReduced: false,
      })
    );
    const dislikeButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('dislike')
    );
    expect(dislikeButton).not.toBeNull();
    flushSync(() => dislikeButton.click());
    expect(onVote).toHaveBeenCalledWith('dislike');
  });
});
