const {
  commitBrowserNavigation,
  moveBrowserHistory,
} = require('../../src/components/workspace/browserHistory');

describe('browserHistory helpers', () => {
  test('commitBrowserNavigation treats bare local ports as localhost urls', () => {
    const current = {
      browserUrl: 'http://localhost:3200/',
      browserHistory: ['http://localhost:3200/'],
      browserHistoryIndex: 0,
    };

    const next = commitBrowserNavigation(current, '4173');

    expect(next.browserHistory).toEqual(['http://localhost:3200/', 'http://localhost:4173/']);
    expect(next.browserHistoryIndex).toBe(1);
    expect(next.browserUrl).toBe('http://localhost:4173/');
  });

  test('commitBrowserNavigation appends a new entry and trims forward history', () => {
    const current = {
      browserUrl: 'http://localhost:3200/',
      browserHistory: ['http://localhost:3200/', 'http://localhost:4173/'],
      browserHistoryIndex: 0,
    };

    const next = commitBrowserNavigation(current, 'localhost:52827/#community');

    expect(next.browserHistory).toEqual([
      'http://localhost:3200/',
      'http://localhost:52827/#community',
    ]);
    expect(next.browserHistoryIndex).toBe(1);
    expect(next.browserUrl).toBe('http://localhost:52827/#community');
  });

  test('commitBrowserNavigation avoids duplicating the active url', () => {
    const current = {
      browserUrl: 'http://localhost:3200/',
      browserHistory: ['http://localhost:3200/'],
      browserHistoryIndex: 0,
    };

    const next = commitBrowserNavigation(current, 'localhost:3200');

    expect(next.browserHistory).toEqual(['http://localhost:3200/']);
    expect(next.browserHistoryIndex).toBe(0);
    expect(next.browserUrl).toBe('http://localhost:3200/');
  });

  test('commitBrowserNavigation turns free text into a searchable page', () => {
    const current = {
      browserUrl: 'http://localhost:3200/',
      browserHistory: ['http://localhost:3200/', 'http://localhost:4173/'],
      browserHistoryIndex: 1,
    };

    const next = commitBrowserNavigation(current, 'nota url valida');

    expect(next.browserUrl).toBe('https://duckduckgo.com/?q=nota%20url%20valida');
    expect(next.browserHistory).toEqual([
      'http://localhost:3200/',
      'http://localhost:4173/',
      'https://duckduckgo.com/?q=nota%20url%20valida',
    ]);
    expect(next.browserHistoryIndex).toBe(2);
  });

  test('moveBrowserHistory navigates back and forward within bounds', () => {
    const current = {
      browserUrl: 'http://localhost:52827/#community',
      browserHistory: [
        'http://localhost:3200/',
        'http://localhost:4173/',
        'http://localhost:52827/#community',
      ],
      browserHistoryIndex: 2,
    };

    const back = moveBrowserHistory(current, -1);
    expect(back.browserHistoryIndex).toBe(1);
    expect(back.browserUrl).toBe('http://localhost:4173/');

    const clamped = moveBrowserHistory(back, -5);
    expect(clamped.browserHistoryIndex).toBe(0);
    expect(clamped.browserUrl).toBe('http://localhost:3200/');

    const forward = moveBrowserHistory(clamped, 10);
    expect(forward.browserHistoryIndex).toBe(2);
    expect(forward.browserUrl).toBe('http://localhost:52827/#community');
  });
});
