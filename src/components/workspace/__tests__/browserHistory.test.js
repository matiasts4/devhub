const { commitBrowserNavigation } = require('../browserHistory');

describe('browserHistory commitBrowserNavigation', () => {
  test('keeps the current navigation state when the next url is invalid', () => {
    const currentState = {
      browserUrl: 'http://localhost:3200/',
      browserHistory: ['http://localhost:3200/'],
      browserHistoryIndex: 0,
    };

    expect(commitBrowserNavigation(currentState, 'http://bad host:3000')).toEqual(currentState);
  });
});
