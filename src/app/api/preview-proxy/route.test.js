describe('GET /api/preview-proxy', () => {
  const originalFetch = global.fetch;
  const originalWarn = console.warn;

  function buildHtmlResponse(html) {
    return {
      status: 200,
      ok: true,
      headers: {
        get: jest.fn((name) => (name.toLowerCase() === 'content-type' ? 'text/html; charset=utf-8' : null)),
      },
      text: jest.fn().mockResolvedValue(html),
    };
  }

  function buildHeaders(values = {}) {
    return {
      get: jest.fn((name) => values[String(name || '').toLowerCase()] ?? null),
    };
  }

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    console.warn = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    console.warn = originalWarn;
    jest.restoreAllMocks();
  });

  it('keeps the proxy instrumentation on the DevHub host when injecting localhost previews', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      status: 200,
      ok: true,
      headers: {
        get: jest.fn((name) => (name.toLowerCase() === 'content-type' ? 'text/html; charset=utf-8' : null)),
      },
      text: jest.fn().mockResolvedValue(
        '<!doctype html><html><head><title>Preview</title></head><body><img src="/logo.png"></body></html>'
      ),
    });

    const { GET } = await import('./route.js');
    const request = {
      url: 'https://devhub.test/api/preview-proxy?url=http%3A%2F%2Flocalhost%3A3200%2Fproducts%2Fbridgespace',
      nextUrl: new URL(
        'https://devhub.test/api/preview-proxy?url=http%3A%2F%2Flocalhost%3A3200%2Fproducts%2Fbridgespace'
      ),
      headers: buildHeaders({ host: 'devhub.test' }),
    };

    const response = await GET(request);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('<base href="http://localhost:3200/products/bridgespace">');
    expect(body).toContain('<meta name="devhub-preview-proxy" content="1">');
    expect(body).toContain('<script data-devhub-overlay>');
    expect(body).toContain('https://devhub.test/api/preview-proxy/?url=');
    expect(body).toContain('src="http://localhost:3200/logo.png"');
  });

  it('prefers forwarded headers over the bind origin when building proxy navigation urls', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      status: 200,
      ok: true,
      headers: {
        get: jest.fn((name) => (name.toLowerCase() === 'content-type' ? 'text/html; charset=utf-8' : null)),
      },
      text: jest.fn().mockResolvedValue(
        '<!doctype html><html><head><title>Preview</title></head><body><a href="/pricing">Pricing</a></body></html>'
      ),
    });

    const { GET } = await import('./route.js');
    const request = {
      url: 'http://0.0.0.0:3400/api/preview-proxy?url=http%3A%2F%2Flocalhost%3A3200%2F',
      nextUrl: new URL('http://0.0.0.0:3400/api/preview-proxy?url=http%3A%2F%2Flocalhost%3A3200%2F'),
      headers: buildHeaders({
        host: '127.0.0.1:3400',
        'x-forwarded-proto': 'http',
      }),
    };

    const response = await GET(request);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('http://127.0.0.1:3400/api/preview-proxy/?url=');
    expect(body).not.toContain('http://0.0.0.0:3400/api/preview-proxy/?url=');
  });

  it('keeps a stable proxy marker and canonical proxy base across localhost rewrites', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      buildHtmlResponse('<!doctype html><html><head></head><body><a href="/catalog">Catalog</a><img src="/logo.png"></body></html>')
    );

    const { GET } = await import('./route.js');
    const request = {
      url: 'https://devhub.test/api/preview-proxy?url=http%3A%2F%2Flocalhost%3A3200%2Fshop',
      nextUrl: new URL('https://devhub.test/api/preview-proxy?url=http%3A%2F%2Flocalhost%3A3200%2Fshop'),
      headers: buildHeaders({ host: 'devhub.test' }),
    };

    const response = await GET(request);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('<meta name="devhub-preview-proxy" content="1">');
    expect(body).toContain('data-devhub-nav-interceptor');
    expect(body).toContain('var P="https://devhub.test/api/preview-proxy/?url="');
    expect(body).toContain('src="http://localhost:3200/logo.png"');
  });

  it('uses forwarded host and proto when generating proxy navigation bases for rewritten previews', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      buildHtmlResponse('<!doctype html><html><head></head><body><a href="/pricing">Pricing</a></body></html>')
    );

    const { GET } = await import('./route.js');
    const request = {
      url: 'http://0.0.0.0:3400/api/preview-proxy?url=http%3A%2F%2Flocalhost%3A3200%2F',
      nextUrl: new URL('http://0.0.0.0:3400/api/preview-proxy?url=http%3A%2F%2Flocalhost%3A3200%2F'),
      headers: buildHeaders({
        host: '127.0.0.1:3400',
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'preview.devhub.test',
      }),
    };

    const response = await GET(request);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('var P="https://preview.devhub.test/api/preview-proxy/?url="');
    expect(body).not.toContain('0.0.0.0:3400/api/preview-proxy');
  });

  it('logs deterministic diagnostics when upstream rewrites cannot keep navigation proxied', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      buildHtmlResponse('<!doctype html><html><head></head><body><a href="https://example.com/outside">Outside</a></body></html>')
    );

    const { GET } = await import('./route.js');
    const request = {
      url: 'https://devhub.test/api/preview-proxy?url=http%3A%2F%2Flocalhost%3A3200%2Fdanger',
      nextUrl: new URL('https://devhub.test/api/preview-proxy?url=http%3A%2F%2Flocalhost%3A3200%2Fdanger'),
      headers: buildHeaders({ host: 'devhub.test' }),
    };

    const response = await GET(request);
    await response.text();

    expect(response.status).toBe(200);
    expect(console.warn).toHaveBeenCalledWith(
      '[devhub][preview-proxy] proxy-navigation-escape-risk',
      expect.objectContaining({
        reason: 'cross-origin-navigation-target',
        target: expect.objectContaining({ href: 'http://localhost:3200/danger' }),
      })
    );
  });

  it('logs deterministic diagnostics when html rewrite fails before response generation', async () => {
    const nextUrl = new URL('https://devhub.test/api/preview-proxy?url=http%3A%2F%2Flocalhost%3A3200%2Fbroken');
    global.fetch = jest.fn().mockResolvedValue({
      status: 200,
      ok: true,
      headers: {
        get: jest.fn((name) => (name.toLowerCase() === 'content-type' ? 'text/html; charset=utf-8' : null)),
      },
      text: jest.fn().mockResolvedValue('<!doctype html><html><head></head><body>broken</body></html>'),
    });

    const realURL = global.URL;
    let brokenTargetCalls = 0;
    global.URL = class BrokenURL extends realURL {
      constructor(value, base) {
        if (String(value).includes('localhost:3200/broken')) {
          brokenTargetCalls += 1;
          if (brokenTargetCalls >= 3) {
            throw new Error('broken target url');
          }
        }
        super(value, base);
      }
    };

    const route = await import('./route.js');

    const request = {
      url: 'https://devhub.test/api/preview-proxy?url=http%3A%2F%2Flocalhost%3A3200%2Fbroken',
      nextUrl,
      headers: buildHeaders({ host: 'devhub.test' }),
    };

    const response = await route.GET(request);
    const text = await response.text();
    global.URL = realURL;

    expect(response.status).toBe(502);
    expect(text).toContain('Failed to rewrite preview HTML');
    expect(console.warn).toHaveBeenCalledWith(
      '[devhub][preview-proxy] html-rewrite-failed',
      expect.objectContaining({
        reason: 'html-rewrite-failed',
        target: expect.objectContaining({ href: 'http://localhost:3200/broken' }),
      })
    );
  });
});
