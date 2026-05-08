const {
  PREVIEW_SUPPORT_MODE,
  SUPPORT_REASON,
  classifyPreviewSupport,
  createSupportState,
  getUnsupportedCopy,
  resolvePreviewSrc,
} = require('../browserPreviewSupport');

function createIframeStub({ src = '', sameOrigin = false, protocolReady = false } = {}) {
  const iframe = {
    getAttribute: jest.fn((name) => (name === 'src' ? src : null)),
  };

  if (sameOrigin) {
    iframe.contentDocument = {
      addEventListener: jest.fn(),
      body: {},
    };
    iframe.contentWindow = {
      document: iframe.contentDocument,
    };
    return iframe;
  }

  Object.defineProperty(iframe, 'contentDocument', {
    configurable: true,
    get() {
      return null;
    },
  });
  Object.defineProperty(iframe, 'contentWindow', {
    configurable: true,
    value: {
      __DEVHUB_VISUAL_EDIT_PROTOCOL__: protocolReady,
      get document() {
        throw new Error('cross-origin');
      },
    },
  });

  return iframe;
}

describe('browserPreviewSupport', () => {
  const originalWindow = global.window;

  beforeEach(() => {
    global.window = {
      location: {
        href: 'https://devhub.test/workspace',
        origin: 'https://devhub.test',
      },
    };
  });

  afterEach(() => {
    global.window = originalWindow;
    jest.restoreAllMocks();
  });

  test('classifies same-origin previews as DOM-supported', () => {
    const iframe = createIframeStub({
      src: 'https://devhub.test/preview',
      sameOrigin: true,
    });

    expect(classifyPreviewSupport({
      browserUrl: 'https://devhub.test/preview',
      iframe,
      iframeSrc: 'https://devhub.test/preview',
    })).toEqual(expect.objectContaining({
      mode: PREVIEW_SUPPORT_MODE.SAME_ORIGIN_DOM,
      reason: SUPPORT_REASON.SAME_ORIGIN_ACCESS,
      viaProxy: false,
    }));
  });

  test('classifies proxied localhost previews and marks proxy escapes immediately', () => {
    const iframe = createIframeStub({
      src: '/api/preview-proxy/?url=http%3A%2F%2Flocalhost%3A3200%2Fapp',
      sameOrigin: false,
    });

    expect(classifyPreviewSupport({
      browserUrl: 'http://localhost:3200/app',
      iframe,
      iframeSrc: '/api/preview-proxy/?url=http%3A%2F%2Flocalhost%3A3200%2Fapp',
    })).toEqual(expect.objectContaining({
      mode: PREVIEW_SUPPORT_MODE.LOCALHOST_PROXY,
      reason: SUPPORT_REASON.PROXY_ACTIVE,
      viaProxy: true,
    }));

    expect(classifyPreviewSupport({
      browserUrl: 'http://localhost:3200/app',
      iframe,
      iframeSrc: 'https://example.com/escaped',
    })).toEqual(expect.objectContaining({
      mode: PREVIEW_SUPPORT_MODE.UNSUPPORTED,
      reason: SUPPORT_REASON.PROXY_ESCAPED,
      viaProxy: false,
    }));
  });

  test('reclassifies localhost previews as supported when navigation returns to the proxy path', () => {
    const iframe = createIframeStub({
      src: '/api/preview-proxy/?url=http%3A%2F%2Flocalhost%3A3200%2Fapp',
      sameOrigin: false,
    });

    const escaped = classifyPreviewSupport({
      browserUrl: 'http://localhost:3200/app',
      iframe,
      iframeSrc: 'https://example.com/escaped',
    });
    const returned = classifyPreviewSupport({
      browserUrl: 'http://localhost:3200/app',
      iframe,
      iframeSrc: '/api/preview-proxy/?url=http%3A%2F%2Flocalhost%3A3200%2Fapp',
    });

    expect(escaped).toEqual(expect.objectContaining({
      mode: PREVIEW_SUPPORT_MODE.UNSUPPORTED,
      reason: SUPPORT_REASON.PROXY_ESCAPED,
    }));
    expect(returned).toEqual(expect.objectContaining({
      mode: PREVIEW_SUPPORT_MODE.LOCALHOST_PROXY,
      reason: SUPPORT_REASON.PROXY_ACTIVE,
      viaProxy: true,
    }));
  });

  test('wraps localhost previews with the proxy only when requested', () => {
    expect(resolvePreviewSrc('http://localhost:3300/', true)).toBe(
      '/api/preview-proxy/?url=http%3A%2F%2Flocalhost%3A3300%2F'
    );
    expect(resolvePreviewSrc('http://localhost:3300/', false)).toBe('http://localhost:3300/');
  });

  test('describes unsupported remote previews without broadening support semantics', () => {
    expect(getUnsupportedCopy(SUPPORT_REASON.CROSS_ORIGIN_NO_INSTRUMENTATION)).toContain(
      'localhost previews through the DevHub proxy'
    );
    expect(getUnsupportedCopy(SUPPORT_REASON.PROXY_ESCAPED)).toContain('left the proxied localhost preview path');
  });

  test('preserves explicit support states when created directly', () => {
    const state = createSupportState(PREVIEW_SUPPORT_MODE.REMOTE_PROTOCOL, SUPPORT_REASON.PROTOCOL_ACTIVE);

    expect(state).toEqual(expect.objectContaining({
      mode: PREVIEW_SUPPORT_MODE.REMOTE_PROTOCOL,
      reason: SUPPORT_REASON.PROTOCOL_ACTIVE,
      viaProxy: false,
    }));
    expect(typeof state.checkedAt).toBe('number');
  });
});
