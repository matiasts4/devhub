/**
 * @module sessionIdUtils
 * Pure utility functions for session ID generation and tmux naming.
 * Safe to import in browser and server.
 */

'use strict';

const crypto = typeof globalThis !== 'undefined' && globalThis.crypto ? globalThis.crypto : require('crypto');

function generateSessionId() {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older environments
  return require('crypto').randomUUID();
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
