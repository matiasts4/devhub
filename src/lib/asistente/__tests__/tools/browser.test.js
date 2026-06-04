const { browserTool } = require('../../tools/browser');

describe('open_url (browserTool)', () => {
  test('returns in-app workspace payload without xdg-open', async () => {
    const result = await browserTool.execute(
      { url: 'https://github.com/foo', label: 'repo' },
      {}
    );
    expect(result).toEqual({
      opened: true,
      workspace: true,
      in_app: true,
      dock: true,
      url: 'https://github.com/foo',
      label: 'repo',
      focus: true,
      message: 'Navegador integrado del workspace abierto → https://github.com/foo',
    });
  });

  test('focus defaults to true', async () => {
    const result = await browserTool.execute({ url: 'https://example.com' }, {});
    expect(result.focus).toBe(true);
  });

  test('rejects javascript: scheme', async () => {
    const result = await browserTool.execute({ url: 'javascript:alert(1)' }, {});
    expect(result.error).toMatch(/unsupported scheme/i);
  });

  test('rejects data: scheme', async () => {
    const result = await browserTool.execute({ url: 'data:text/html,hi' }, {});
    expect(result.error).toMatch(/unsupported scheme/i);
  });

  test('rejects malformed URL', async () => {
    const result = await browserTool.execute({ url: 'not a url' }, {});
    expect(result.error).toBe('invalid url');
  });

  test('missing url returns error', async () => {
    const result = await browserTool.execute({}, {});
    expect(result.error).toMatch(/url is required/i);
  });

  test('coerces string focus=false', async () => {
    const result = await browserTool.execute(
      { url: 'https://example.com', focus: 'false' },
      {}
    );
    expect(result.focus).toBe(false);
  });
});