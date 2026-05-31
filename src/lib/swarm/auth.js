/**
 * Auth utilities for DevHub Swarm — HMAC-SHA256 token generation and verification.
 *
 * AUTH-4: Token Generation Utility
 */

import { randomBytes, createHmac, createHash } from 'node:crypto';

/**
 * Generate a 32-byte random hex string for use as an agent secret.
 * @returns {string} 64-character hex string
 */
export function generateAgentSecret() {
  return randomBytes(32).toString('hex');
}

/**
 * Hash a token secret using SHA-256.
 * Used to store a one-way hash of the agent secret in the DB.
 * @param {string} secret - The raw secret (64-char hex)
 * @returns {string} SHA-256 hex hash (64 chars)
 */
export function hashToken(secret) {
  return createHash('sha256').update(secret).digest('hex');
}

/**
 * Sign a request using HMAC-SHA256.
 * The signature covers `timestamp.body_hash` where body_hash is SHA-256 of the serialized body.
 * @param {string} secret - The raw agent secret (64-char hex)
 * @param {string} timestamp - ISO 8601 timestamp
 * @param {string|object} body - Request body (object will be JSON-serialized)
 * @returns {string} HMAC-SHA256 hex signature (64 chars)
 */
export function signRequest(secret, timestamp, body) {
  const bodyHash = createHash('sha256')
    .update(typeof body === 'string' ? body : JSON.stringify(body))
    .digest('hex');
  const message = `${timestamp}.${bodyHash}`;
  return createHmac('sha256', secret).update(message).digest('hex');
}

/**
 * Check if a token has expired based on its expires_at timestamp.
 * @param {string|null} expiresAt - ISO timestamp of token expiry
 * @returns {boolean} true if token has expired or expiresAt is null/missing
 */
export function isTokenExpired(expiresAt) {
  if (!expiresAt) return true;
  const expiryMs = Date.parse(expiresAt);
  if (Number.isNaN(expiryMs)) return true;
  return Date.now() > expiryMs;
}

/**
 * Verify an HMAC-SHA256 request signature.
 * Rejects signatures with timestamps older than 30 seconds.
 *
 * @param {string} secret - The raw agent secret
 * @param {string} timestamp - ISO 8601 timestamp from the request
 * @param {string|object} body - Request body (object will be JSON-serialized)
 * @param {string} signature - The HMAC-SHA256 hex signature to verify
 * @returns {boolean} true if signature is valid and timestamp is within 30s window
 */
export function verifySignature(secret, timestamp, body, signature) {
  // Reject timestamps older than 30 seconds
  const TIMESTAMP_TOLERANCE_MS = 30_000;
  const requestTime = Date.parse(timestamp);
  if (Number.isNaN(requestTime)) return false;
  if (Math.abs(Date.now() - requestTime) > TIMESTAMP_TOLERANCE_MS) return false;

  const expected = signRequest(secret, timestamp, body);
  return expected === signature;
}
