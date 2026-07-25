/**
 * @module sessionIdUtils
 * Pure utility functions for session ID generation and tmux naming.
 * 100% browser-safe — no Node.js-only APIs.
 */

'use strict';

function generateSessionId() {
  let uuid;
  if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.randomUUID) {
    uuid = globalThis.crypto.randomUUID();
  } else {
    // Manual UUID v4 fallback for environments without crypto.randomUUID
    uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
  // OpenCode requires session IDs to start with "ses_"
  return `ses_${uuid}`;
}

function buildTmuxSessionName(sessionId) {
  if (!sessionId) return null;
  const short = sessionId.replace(/-/g, '').substring(0, 12);
  return `devhub-swarm-${short}`;
}

module.exports = {
  generateSessionId,
  buildTmuxSessionName,
};
