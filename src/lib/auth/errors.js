'use strict';

/**
 * Typed errors for the AuthProvider port. The port never throws on
 * adapter-level failures (network, expired token, etc.); instead it
 * returns `{ ok: false, error: { code, message } }` envelopes (REQ-AUTH-4).
 *
 * The classes here exist for the cases where boot-time configuration is
 * invalid (`ConfigError`) or a network layer must surface a non-recoverable
 * condition.
 */

class AuthError extends Error {
  constructor(message, code = 'auth_error') {
    super(message);
    this.name = 'AuthError';
    this.code = code;
  }
}

class SessionExpiredError extends AuthError {
  constructor(message = 'session has expired') {
    super(message, 'session_expired');
    this.name = 'SessionExpiredError';
  }
}

class NetworkError extends AuthError {
  constructor(message = 'network failure') {
    super(message, 'network');
    this.name = 'NetworkError';
  }
}

class ConfigError extends AuthError {
  constructor(message) {
    super(message, 'config_error');
    this.name = 'ConfigError';
  }
}

class PermissionError extends AuthError {
  constructor(message = 'permission denied', payload = {}) {
    super(message, 'permission_denied');
    this.name = 'PermissionError';
    Object.assign(this, payload);
  }
}

function envelopeError(err) {
  return { ok: false, error: { code: err.code || 'auth_error', message: err.message } };
}

module.exports = {
  AuthError,
  SessionExpiredError,
  NetworkError,
  ConfigError,
  PermissionError,
  envelopeError,
};
