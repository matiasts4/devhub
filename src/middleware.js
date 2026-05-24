/**
 * Next.js Middleware — Auth gate for agenthub API routes (AUTH-3).
 *
 * This middleware runs BEFORE route handlers and provides a lightweight auth check
 * for all /api/agenthub/* routes. It handles the dual-mode transition:
 *
 * - Permissive mode (default): Checks for auth headers, logs warnings, passes through.
 *   Downstream route handlers can use createAuthMiddleware() for full HMAC verification.
 *
 * - Enforced mode (AGENT_AUTH_ENFORCED=true): Validates header presence and recency.
 *   Returns 401 for missing/invalid auth headers. Full HMAC verification is done
 *   in route handlers via createAuthMiddleware() since DB access requires Node.js runtime.
 *
 * Note: Next.js middleware runs in Edge Runtime and cannot access better-sqlite3.
 * Full HMAC + DB verification happens in route handlers using authMiddleware.js.
 */

import { NextResponse } from 'next/server';

const AGENTHUB_PATH_PREFIX = '/api/agenthub';
const TIMESTAMP_TOLERANCE_MS = 30_000;

export const config = {
  matcher: '/api/agenthub/:path*',
};

export function middleware(request) {
  // Only process requests to agenthub paths
  if (!request.nextUrl.pathname.startsWith(AGENTHUB_PATH_PREFIX)) {
    return NextResponse.next();
  }

  const enforced = process.env.AGENT_AUTH_ENFORCED === 'true';

  const signature = request.headers.get('x-agent-signature');
  const timestamp = request.headers.get('x-agent-timestamp');
  const agentId = request.headers.get('x-agent-id');

  // No auth headers at all
  if (!signature && !timestamp && !agentId) {
    if (!enforced) {
      console.warn('[agenthub-middleware] No auth headers provided (permissive mode)');
      return NextResponse.next();
    }
    return NextResponse.json(
      { error: 'Authentication required', code: 'AUTH_MISSING' },
      { status: 401 }
    );
  }

  // Partial headers — some present but not all
  if (!signature || !timestamp || !agentId) {
    if (!enforced) {
      console.warn('[agenthub-middleware] Incomplete auth headers (permissive mode)');
      return NextResponse.next();
    }
    return NextResponse.json(
      { error: 'Missing authentication headers', code: 'AUTH_INCOMPLETE' },
      { status: 401 }
    );
  }

  // Validate timestamp recency (±30s)
  const requestTime = Date.parse(timestamp);
  if (Number.isNaN(requestTime)) {
    if (!enforced) {
      console.warn('[agenthub-middleware] Invalid timestamp format (permissive mode)');
      return NextResponse.next();
    }
    return NextResponse.json(
      { error: 'Invalid timestamp format', code: 'AUTH_INVALID_TIMESTAMP' },
      { status: 401 }
    );
  }

  if (Math.abs(Date.now() - requestTime) > TIMESTAMP_TOLERANCE_MS) {
    if (!enforced) {
      console.warn('[agenthub-middleware] Timestamp outside 30s window (permissive mode)');
      return NextResponse.next();
    }
    return NextResponse.json(
      { error: 'Timestamp expired', code: 'AUTH_EXPIRED_TIMESTAMP' },
      { status: 401 }
    );
  }

  // Validate signature format (64-char hex string)
  if (!/^[0-9a-f]{64}$/.test(signature)) {
    if (!enforced) {
      console.warn('[agenthub-middleware] Invalid signature format (permissive mode)');
      return NextResponse.next();
    }
    return NextResponse.json(
      { error: 'Invalid signature format', code: 'AUTH_INVALID_SIG_FORMAT' },
      { status: 401 }
    );
  }

  // Headers pass lightweight validation — set agent ID on request for downstream use
  const response = NextResponse.next();
  response.headers.set('x-agent-auth-status', enforced ? 'verified-headers' : 'permissive');
  response.headers.set('x-agent-id-verified', agentId);

  return response;
}
