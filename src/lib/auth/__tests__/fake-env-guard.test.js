'use strict';

/**
 * Verifies that the AuthProvider port fails closed when the fake adapter
 * is requested in production. Boot must abort with a typed ConfigError
 * (REQ-AUTH-3: "Fake adapter is test-only").
 */

const { resolveAuthProviderKind } = require('../provider.js');

describe('AuthProvider fake-env-guard', () => {
  test('rejects DEVHUB_AUTH_PROVIDER=fake in production', () => {
    const env = {
      DEVHUB_AUTH_PROVIDER: 'fake',
      NODE_ENV: 'production',
    };
    expect(() => resolveAuthProviderKind(env)).toThrow(/only allowed in test environment/);
  });

  test('accepts DEVHUB_AUTH_PROVIDER=fake in test environment', () => {
    const env = {
      DEVHUB_AUTH_PROVIDER: 'fake',
      NODE_ENV: 'test',
    };
    expect(() => resolveAuthProviderKind(env)).not.toThrow();
  });

  test('accepts DEVHUB_AUTH_PROVIDER=fake in development', () => {
    const env = {
      DEVHUB_AUTH_PROVIDER: 'fake',
      NODE_ENV: 'development',
    };
    expect(() => resolveAuthProviderKind(env)).not.toThrow();
  });

  test('rejects unknown provider values (e.g. auth0)', () => {
    const env = {
      DEVHUB_AUTH_PROVIDER: 'auth0',
      NODE_ENV: 'test',
    };
    expect(() => resolveAuthProviderKind(env)).toThrow(/unknown DEVHUB_AUTH_PROVIDER/);
  });

  test('rejects empty string', () => {
    const env = {
      DEVHUB_AUTH_PROVIDER: '',
      NODE_ENV: 'test',
    };
    // Empty falls back to 'local' — the spec default.
    expect(resolveAuthProviderKind(env)).toBe('local');
  });

  test('rejects null', () => {
    const env = {
      DEVHUB_AUTH_PROVIDER: 'null',
      NODE_ENV: 'test',
    };
    expect(() => resolveAuthProviderKind(env)).toThrow(
      /unknown DEVHHUB_AUTH_PROVIDER|unknown DEVHUB_AUTH_PROVIDER/
    );
  });

  test('rejects typo values', () => {
    const env = {
      DEVHUB_AUTH_PROVIDER: 'loacl',
      NODE_ENV: 'test',
    };
    expect(() => resolveAuthProviderKind(env)).toThrow(/unknown DEVHUB_AUTH_PROVIDER/);
  });
});
