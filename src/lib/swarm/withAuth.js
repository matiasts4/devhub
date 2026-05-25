/**
 * Next.js Route Handler HMAC auth wrapper.
 *
 * AUTH-2: Full HMAC verification for Next.js App Router route handlers.
 * Replaces Express-style middleware with a wrapper compatible with
 * export const POST = withAuth(async function POST(request) { ... }).
 */

import { verifySignature } from './auth.js';
import { getActiveAuthToken, getAgentSecret, getDb } from '../db/localDb.js';
import { isAuthEnforced } from './authMiddleware.js';
import { NextResponse } from 'next/server';

const DEFAULT_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Wrap a Next.js route handler with HMAC authentication.
 *
 * @param {function} handler - Async route handler (request) => NextResponse
 * @param {object} [opts] - Options
 * @param {string[]} [opts.methods] - HTTP methods to protect (default: POST, PUT, PATCH, DELETE)
 * @returns {function} Wrapped handler
 */
export function withAuth(handler, opts = {}) {
  const methods = new Set(opts.methods || ['POST', 'PUT', 'PATCH', 'DELETE']);
  const getDbFn = opts.getDb || getDb;

  return async function authenticatedHandler(request) {
    const method = request.method?.toUpperCase();

    if (!methods.has(method)) {
      return handler(request);
    }

    const enforced = isAuthEnforced();
    const signature = request.headers.get('x-agent-signature');
    const timestamp = request.headers.get('x-agent-timestamp');
    const agentId = request.headers.get('x-agent-id');

    if (!signature && !timestamp && !agentId) {
      if (!enforced) {
        console.warn('[withAuth] No auth headers (permissive mode)');
        return handler(request);
      }
      return NextResponse.json(
        { error: 'Authentication required', code: 'AUTH_MISSING' },
        { status: 401 }
      );
    }

    if (!signature || !timestamp || !agentId) {
      if (!enforced) {
        console.warn('[withAuth] Incomplete auth headers (permissive mode)');
        return handler(request);
      }
      return NextResponse.json(
        { error: 'Missing authentication headers', code: 'AUTH_INCOMPLETE' },
        { status: 401 }
      );
    }

    let db;
    try {
      db = getDbFn();
    } catch {
      if (!enforced) {
        console.warn('[withAuth] DB unavailable (permissive mode)');
        return handler(request);
      }
      return NextResponse.json(
        { error: 'Authentication service unavailable', code: 'AUTH_DB_ERROR' },
        { status: 503 }
      );
    }

    const token = getActiveAuthToken(db, agentId);
    if (!token) {
      if (!enforced) {
        console.warn(`[withAuth] No active token for agent ${agentId} (permissive mode)`);
        request.agentId = agentId;
        return handler(request);
      }
      return NextResponse.json(
        { error: 'Agent not registered or token revoked', code: 'AUTH_NO_TOKEN' },
        { status: 401 }
      );
    }

    const secret = getAgentSecret(db, agentId);
    if (!secret) {
      if (!enforced) {
        console.warn(`[withAuth] No secret for agent ${agentId} (permissive mode)`);
        request.agentId = agentId;
        return handler(request);
      }
      return NextResponse.json(
        { error: 'Cannot verify request signature', code: 'AUTH_NO_SECRET' },
        { status: 401 }
      );
    }

    // Parse request body for signature verification
    let body;
    try {
      const cloned = request.clone();
      body = await cloned.json();
    } catch {
      body = {};
    }

    // Verify HMAC signature
    const isValid = verifySignature(secret, timestamp, body, signature);
    if (!isValid) {
      if (!enforced) {
        console.warn(`[withAuth] Invalid signature for agent ${agentId} (permissive mode)`);
        request.agentId = agentId;
        return handler(request);
      }
      return NextResponse.json(
        { error: 'Invalid signature', code: 'AUTH_INVALID_SIG' },
        { status: 401 }
      );
    }

    request.agentId = agentId;
    return handler(request);
  };
}
