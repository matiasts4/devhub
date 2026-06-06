'use strict';

/**
 * Fake AuthProvider adapter — test-only.
 *
 * Returns a session whose `user.id` is configurable (default `test-user`)
 * so tests can exercise different actor identities without spinning up a
 * real Supabase project. Boot fails closed when NODE_ENV=production
 * (REQ-AUTH-3).
 */

const { SessionExpiredError } = require('../errors.js');

const DEFAULT_USER = { id: 'test-user', email: 'test-user@devhub.local' };
const DEFAULT_MEMBERSHIPS = [{ workspaceId: 'test-ws', role: 'owner' }];

function createFakeAuthProvider(options = {}) {
  const user = options.user || DEFAULT_USER;
  const memberships = options.workspaceMemberships || DEFAULT_MEMBERSHIPS;
  const session = { user, workspaceMemberships: memberships };
  const accessToken = options.accessToken || `fake-token-${user.id}`;
  const expiresAt = options.expiresAt || null; // null = never expires
  const sessionStore = new Map([[accessToken, { session, expiresAt }]]);

  function isExpired(token) {
    const record = sessionStore.get(token);
    if (!record) return true;
    if (record.expiresAt == null) return false;
    return Date.now() > record.expiresAt;
  }

  return {
    kind: 'fake',

    async signInWithMagicLink() {
      return { ok: true, status: 'sent', delivery: 'fake' };
    },

    async signUpWithMagicLink() {
      return { ok: true, status: 'sent', delivery: 'fake' };
    },

    async signOut() {
      sessionStore.clear();
      return { ok: true };
    },

    async getSession() {
      return session;
    },

    async verifyToken(token) {
      if (!token || typeof token !== 'string') {
        throw new SessionExpiredError('token missing');
      }
      if (isExpired(token)) {
        throw new SessionExpiredError(`token ${token} expired`);
      }
      return sessionStore.get(token).session;
    },

    async getAccessToken() {
      return accessToken;
    },

    onAuthStateChange(_cb) {
      return () => {};
    },
  };
}

module.exports = {
  createFakeAuthProvider,
};
