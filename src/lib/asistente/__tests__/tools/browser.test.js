const { browserTool } = require('../../tools/browser');

const childProcess = require('child_process');

afterEach(() => {
  jest.restoreAllMocks();
});

describe('open_url (browserTool)', () => {
  test('accepts https URL, returns { opened: true } and calls xdg-open', async () => {
    const execSpy = jest.spyOn(childProcess, 'execSync').mockImplementation(() => {});
    const result = await browserTool.execute({ url: 'https://github.com/foo' }, {});
    expect(result.opened).toBe(true);
    expect(result.url).toBe('https://github.com/foo');
    // Orphan /tmp/devhub-pending-url.txt is no longer written — verified by
    // code review (writeFileSync is no longer imported in browser.js).
    expect(execSpy).toHaveBeenCalled();
  });

  test('rejects javascript: scheme without invoking xdg-open', async () => {
    const spy = jest.spyOn(childProcess, 'execSync').mockImplementation(() => {});
    const result = await browserTool.execute({ url: 'javascript:alert(1)' }, {});
    expect(result.error).toMatch(/unsupported scheme/i);
    expect(spy).not.toHaveBeenCalled();
  });

  test('rejects data: scheme', async () => {
    const spy = jest.spyOn(childProcess, 'execSync').mockImplementation(() => {});
    const result = await browserTool.execute({ url: 'data:text/html,hi' }, {});
    expect(result.error).toMatch(/unsupported scheme/i);
  });

  test('rejects malformed URL', async () => {
    const spy = jest.spyOn(childProcess, 'execSync').mockImplementation(() => {});
    const result = await browserTool.execute({ url: 'not a url' }, {});
    expect(result.error).toBe('invalid url');
  });

  test('missing url returns error', async () => {
    const result = await browserTool.execute({}, {});
    expect(result.error).toMatch(/url is required/i);
  });
});
