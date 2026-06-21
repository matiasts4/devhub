'use strict';

const {
  LOCAL_USER,
  LOCAL_USER_ID,
  LOCAL_USER_EMAIL,
  LOCAL_WORKSPACE_ID,
} = require('../../constants/local');

/**
 * Local AuthProvider adapter.
 *
 * Returns a synthetic `local-user` session without any I/O. This is the
 * default adapter and the regression budget for local mode: every existing
 * tool and surface must keep working with zero env changes (REQ-AUTH-1).
 */

const SYNTHETIC_SESSION = Object.freeze({
  user: Object.freeze({ id: LOCAL_USER_ID, email: LOCAL_USER_EMAIL }),
  workspaceMemberships: Object.freeze([
    Object.freeze({ workspaceId: LOCAL_WORKSPACE_ID, role: 'owner' }),
  ]),
});

const SYNTHETIC_TOKEN = 'local-synthetic-token';

function createLocalAuthProvider() {
  return {
    kind: 'local',

    async signInWithMagicLink() {
      return { ok: true, status: 'sent', delivery: 'synthetic' };
    },

    async signUpWithMagicLink() {
      return { ok: true, status: 'sent', delivery: 'synthetic' };
    },

    async signOut() {
      return { ok: true };
    },

    async getSession() {
      return SYNTHETIC_SESSION;
    },

    async verifyToken(_token) {
      return SYNTHETIC_SESSION;
    },

    async getAccessToken() {
      return SYNTHETIC_TOKEN;
    },

    onAuthStateChange(_cb) {
      // No event stream in local mode. The unsubscribe is a no-op.
      return () => {};
    },
  };
}

module.exports = {
  createLocalAuthProvider,
  SYNTHETIC_SESSION,
  SYNTHETIC_TOKEN,
};
