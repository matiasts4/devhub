const { resolveProjectRoot, assertWithinRoot } = require('../../tools/pathSandbox');

describe('pathSandbox.resolveProjectRoot', () => {
  test('honors DEVHUB_PROJECT_ROOT env var when set', () => {
    const original = process.env.DEVHUB_PROJECT_ROOT;
    try {
      process.env.DEVHUB_PROJECT_ROOT = '/tmp/devhub-sandbox-root';
      expect(resolveProjectRoot()).toBe('/tmp/devhub-sandbox-root');
    } finally {
      if (original === undefined) delete process.env.DEVHUB_PROJECT_ROOT;
      else process.env.DEVHUB_PROJECT_ROOT = original;
    }
  });

  test('falls back to process.cwd() when env is unset', () => {
    const original = process.env.DEVHUB_PROJECT_ROOT;
    try {
      delete process.env.DEVHUB_PROJECT_ROOT;
      expect(resolveProjectRoot()).toBe(process.cwd());
    } finally {
      if (original !== undefined) process.env.DEVHUB_PROJECT_ROOT = original;
    }
  });
});

describe('pathSandbox.assertWithinRoot', () => {
  const FAKE_ROOT = '/home/me/project';
  let originalRoot;
  beforeAll(() => {
    originalRoot = process.env.DEVHUB_PROJECT_ROOT;
    process.env.DEVHUB_PROJECT_ROOT = FAKE_ROOT;
  });
  afterAll(() => {
    if (originalRoot === undefined) delete process.env.DEVHUB_PROJECT_ROOT;
    else process.env.DEVHUB_PROJECT_ROOT = originalRoot;
  });

  test('accepts the project root itself', () => {
    expect(assertWithinRoot(FAKE_ROOT)).toBe(true);
  });

  test('accepts a subpath of the project root', () => {
    expect(assertWithinRoot(`${FAKE_ROOT}/src/lib`)).toBe(true);
  });

  test('accepts a path under <root>/.devhub/', () => {
    expect(assertWithinRoot(`${FAKE_ROOT}/.devhub/state.json`)).toBe(true);
  });

  test('accepts a /tmp/devhub-* scratch path', () => {
    expect(assertWithinRoot('/tmp/devhub-scratch/log.txt')).toBe(true);
  });

  test('rejects /etc/passwd', () => {
    expect(assertWithinRoot('/etc/passwd')).toBe(false);
  });

  test('rejects a `..` escape (path resolves outside root)', () => {
    expect(assertWithinRoot(`${FAKE_ROOT}/../etc`)).toBe(false);
  });

  test('rejects an arbitrary /tmp path that is not devhub-*', () => {
    expect(assertWithinRoot('/tmp/some-other-tool/file.txt')).toBe(false);
  });

  test('rejects a parent directory of the project root', () => {
    expect(assertWithinRoot('/home/me')).toBe(false);
  });
});
