const {
  commitBrowserNavigation,
  moveBrowserHistory,
  syncBrowserUrlFromNative,
  urlsLooselyEqual,
} = require('../browserHistory');

describe('browserHistory commitBrowserNavigation', () => {
  test('keeps the current navigation state when the next url is invalid', () => {
    const currentState = {
      browserUrl: 'http://localhost:3200/',
      browserHistory: ['http://localhost:3200/'],
      browserHistoryIndex: 0,
    };

    expect(commitBrowserNavigation(currentState, 'http://bad host:3000')).toEqual(currentState);
  });

  test('appends a new url and advances the index', () => {
    const currentState = {
      browserUrl: 'https://example.com/',
      browserHistory: ['https://example.com/'],
      browserHistoryIndex: 0,
    };

    expect(commitBrowserNavigation(currentState, 'https://google.com')).toEqual({
      browserUrl: 'https://google.com/',
      browserHistory: ['https://example.com/', 'https://google.com/'],
      browserHistoryIndex: 1,
    });
  });
});

describe('browserHistory moveBrowserHistory', () => {
  test('moves back and forward without truncating the stack', () => {
    const stack = {
      browserUrl: 'https://c.example/',
      browserHistory: ['https://a.example/', 'https://b.example/', 'https://c.example/'],
      browserHistoryIndex: 2,
    };

    const back = moveBrowserHistory(stack, -1);
    expect(back).toEqual({
      browserUrl: 'https://b.example/',
      browserHistory: stack.browserHistory,
      browserHistoryIndex: 1,
    });

    const forward = moveBrowserHistory(back, 1);
    expect(forward).toEqual(stack);
  });
});

describe('browserHistory syncBrowserUrlFromNative', () => {
  test('does not truncate forward history when page-load echoes the current entry', () => {
    const stack = {
      browserUrl: 'https://b.example/',
      browserHistory: ['https://a.example/', 'https://b.example/', 'https://c.example/'],
      browserHistoryIndex: 1,
    };

    // WebView often reports without trailing slash / with redirect variants.
    const synced = syncBrowserUrlFromNative(stack, 'https://b.example');
    expect(synced.browserHistory).toEqual(stack.browserHistory);
    expect(synced.browserHistoryIndex).toBe(1);
    expect(synced.browserUrl).toBe('https://b.example/');
  });

  test('moves index to an existing entry instead of truncating on back/forward paint', () => {
    const stack = {
      browserUrl: 'https://c.example/',
      browserHistory: ['https://a.example/', 'https://b.example/', 'https://c.example/'],
      browserHistoryIndex: 2,
    };

    const synced = syncBrowserUrlFromNative(stack, 'https://a.example/');
    expect(synced.browserHistory).toEqual(stack.browserHistory);
    expect(synced.browserHistoryIndex).toBe(0);
    expect(synced.browserUrl).toBe('https://a.example/');
  });

  test('appends only for genuine new in-page navigations', () => {
    const stack = {
      browserUrl: 'https://a.example/',
      browserHistory: ['https://a.example/'],
      browserHistoryIndex: 0,
    };

    const synced = syncBrowserUrlFromNative(stack, 'https://new.example/path');
    expect(synced.browserHistory).toEqual(['https://a.example/', 'https://new.example/path']);
    expect(synced.browserHistoryIndex).toBe(1);
  });
});

describe('urlsLooselyEqual', () => {
  test('treats trailing-slash variants as equal', () => {
    expect(urlsLooselyEqual('https://google.com', 'https://google.com/')).toBe(true);
    expect(urlsLooselyEqual('https://google.com/search?q=1', 'https://google.com/search?q=2')).toBe(
      false
    );
  });
});
