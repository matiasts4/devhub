/**
 * Auth middleware for DevHub Swarm — HMAC-SHA256 verification with dual-mode transition.
 *
 * AUTH-2: HMAC Verification Middleware
 * AUTH-3: Dual-Mode Transition (permissive / enforced)
 *
 * Permissive mode (default): Log warnings for missing/invalid auth but allow requests through.
 * Enforced mode (AGENT_AUTH_ENFORCED=true): Reject requests with 401 if auth is missing or invalid.
 */

import { verifySignature } from './auth.js';
import { getActiveAuthToken } from '../db/localDb.js';

/**
 * Check if auth enforcement is enabled via environment variable.
 * @returns {boolean}
 */
export function isAuthEnforced() {
  return process.env.AGENT_AUTH_ENFORCED === 'true';
}

/**
 * Create an HMAC auth middleware for Express/Next.js API routes.
 *
 * @param {object} opts
 * @param {function} opts.getDb - Function returning a better-sqlite3 database handle
 * @param {function} [opts.getAgentSecret] - Function (agentId, tokenRecord) => rawSecret|null
 *   If not provided, signature verification is skipped (only token existence is checked).
 *   If async, the middleware returns a Promise (use with async route handlers).
 * @returns {function} Express-style middleware (req, res, next)
 */
export function createAuthMiddleware({ getDb, getAgentSecret } = {}) {
  return function authMiddleware(req, res, next) {
    const enforced = isAuthEnforced();

    // Read auth headers (case-insensitive lookup)
    const signature =
      req.headers['x-agent-signature'] ||
      (typeof req.get === 'function' ? req.get('x-agent-signature') : undefined);
    const timestamp =
      req.headers['x-agent-timestamp'] ||
      (typeof req.get === 'function' ? req.get('x-agent-timestamp') : undefined);
    const agentId =
      req.headers['x-agent-id'] ||
      (typeof req.get === 'function' ? req.get('x-agent-id') : undefined);

    // No auth headers at all
    if (!signature && !timestamp && !agentId) {
      if (!enforced) {
        console.warn('[authMiddleware] No auth headers provided (permissive mode)');
        return next();
      }
      return res.status(401).json({
        error: 'Authentication required',
        code: 'AUTH_MISSING',
      });
    }

    // Partial headers — some present but not all
    if (!signature || !timestamp || !agentId) {
      if (!enforced) {
        console.warn('[authMiddleware] Incomplete auth headers (permissive mode)');
        return next();
      }
      return res.status(401).json({
        error: 'Missing authentication headers',
        code: 'AUTH_INCOMPLETE',
      });
    }

    // Look up active auth token for this agent
    const db = getDb();
    const token = getActiveAuthToken(db, agentId);

    if (!token) {
      if (!enforced) {
        console.warn(`[authMiddleware] No active token for agent ${agentId} (permissive mode)`);
        req.agentId = agentId;
        return next();
      }
      return res.status(401).json({
        error: 'Agent not registered or token revoked',
        code: 'AUTH_NO_TOKEN',
      });
    }

    // Resolve agent secret for HMAC verification
    const secret = getAgentSecret ? getAgentSecret(agentId, token) : null;

    if (!secret) {
      if (!enforced) {
        console.warn(
          `[authMiddleware] Cannot verify signature for agent ${agentId}: no secret resolver (permissive mode)`
        );
        req.agentId = agentId;
        return next();
      }
      return res.status(401).json({
        error: 'Cannot verify request signature',
        code: 'AUTH_NO_SECRET',
      });
    }

    // Get request body — support both parsed body and raw content
    const body = req.body || {};

    // Verify HMAC-SHA256 signature (includes timestamp freshness check)
    const isValid = verifySignature(secret, timestamp, body, signature);

    if (!isValid) {
      if (!enforced) {
        console.warn(`[authMiddleware] Invalid signature for agent ${agentId} (permissive mode)`);
        req.agentId = agentId;
        return next();
      }
      return res.status(401).json({
        error: 'Invalid signature',
        code: 'AUTH_INVALID_SIG',
      });
    }

    // Auth valid — set agent ID on request and proceed
    req.agentId = agentId;
    next();
  };
}
