'use strict';

/**
 * Auth utilities for DevHub CLI — credential management and request signing.
 * Wraps src/lib/swarm/auth.js for CommonJS compatibility.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Reutilizar funciones de src/lib/swarm/auth.cjs (CommonJS wrapper)
const swarmAuth = require('../../src/lib/swarm/auth.cjs');

const AUTH_FILE_PATH = path.join(os.homedir(), '.devhub', 'auth.json');

function readAuthFromEnv() {
  const secret = process.env.DEVHUB_AGENT_TOKEN || null;
  const agentId = process.env.DEVHUB_AGENT_ID || null;
  if (!secret || !agentId) return null;

  return {
    agent_id: agentId,
    secret,
    workspace_id: process.env.DEVHUB_WORKSPACE_ID || null,
    created_at: process.env.DEVHUB_AUTH_CREATED_AT || null,
    source: 'env',
  };
}

/**
 * Generate a 32-byte random hex string for use as an agent secret.
 * Delegates to src/lib/swarm/auth.js.
 * @returns {string} 64-character hex string
 */
function generateAgentSecret() {
  return swarmAuth.generateAgentSecret();
}

/**
 * Hash a token secret using SHA-256.
 * Delegates to src/lib/swarm/auth.js.
 * @param {string} secret - The raw secret (64-char hex)
 * @returns {string} SHA-256 hex hash (64 chars)
 */
function hashToken(secret) {
  return swarmAuth.hashToken(secret);
}

/**
 * Sign a request using HMAC-SHA256.
 * Delegates to src/lib/swarm/auth.js.
 * @param {string} secret - The raw agent secret (64-char hex)
 * @param {string} timestamp - ISO 8601 timestamp
 * @param {string|object} body - Request body (object will be JSON-serialized)
 * @returns {string} HMAC-SHA256 hex signature (64 chars)
 */
function signRequest(secret, timestamp, body) {
  return swarmAuth.signRequest(secret, timestamp, body);
}

/**
 * Read auth credentials from ~/.devhub/auth.json.
 * @returns {object|null} { agent_id, secret, workspace_id, created_at } or null if not found
 */
function readAuthFile() {
  try {
    if (!fs.existsSync(AUTH_FILE_PATH)) {
      return readAuthFromEnv();
    }
    const content = fs.readFileSync(AUTH_FILE_PATH, 'utf8');
    return {
      ...JSON.parse(content),
      source: 'file',
    };
  } catch {
    return readAuthFromEnv();
  }
}

/**
 * Write auth credentials to ~/.devhub/auth.json with 0600 permissions.
 * @param {object} auth - { agent_id, secret, workspace_id, created_at }
 */
function writeAuthFile(auth) {
  const dir = path.dirname(AUTH_FILE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  fs.writeFileSync(AUTH_FILE_PATH, JSON.stringify(auth, null, 2), { mode: 0o600 });
}

/**
 * Delete auth credentials file.
 */
function deleteAuthFile() {
  try {
    if (fs.existsSync(AUTH_FILE_PATH)) {
      fs.unlinkSync(AUTH_FILE_PATH);
    }
  } catch {
    // Ignore errors
  }
}

module.exports = {
  generateAgentSecret,
  hashToken,
  signRequest,
  readAuthFile,
  readAuthFromEnv,
  writeAuthFile,
  deleteAuthFile,
  AUTH_FILE_PATH,
};
