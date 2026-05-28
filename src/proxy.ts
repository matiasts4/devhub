import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { NextResponse } from 'next/server';

const AGENTHUB_PATH_PREFIX = '/api/agenthub';
const TIMESTAMP_TOLERANCE_MS = 30_000;

// Inicializar de manera condicional por si no hay env vars
const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

const ratelimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(15, '10 s'),
      ephemeralCache: new Map(),
    })
  : null;

function validateAgenthubAuth(request) {
  const { pathname } = request.nextUrl;

  if (!pathname.startsWith(AGENTHUB_PATH_PREFIX)) {
    return { allow: true, verifiedAgentId: null, authStatus: null };
  }

  const enforced = process.env.AGENT_AUTH_ENFORCED === 'true';
  const signature = request.headers.get('x-agent-signature');
  const timestamp = request.headers.get('x-agent-timestamp');
  const agentId = request.headers.get('x-agent-id');

  if (!signature && !timestamp && !agentId) {
    if (!enforced) {
      console.warn('[agenthub-proxy] No auth headers provided (permissive mode)');
      return { allow: true, verifiedAgentId: null, authStatus: null };
    }

    return {
      allow: false,
      response: NextResponse.json(
        { error: 'Authentication required', code: 'AUTH_MISSING' },
        { status: 401 }
      ),
    };
  }

  if (!signature || !timestamp || !agentId) {
    if (!enforced) {
      console.warn('[agenthub-proxy] Incomplete auth headers (permissive mode)');
      return { allow: true, verifiedAgentId: null, authStatus: null };
    }

    return {
      allow: false,
      response: NextResponse.json(
        { error: 'Missing authentication headers', code: 'AUTH_INCOMPLETE' },
        { status: 401 }
      ),
    };
  }

  const requestTime = Date.parse(timestamp);
  if (Number.isNaN(requestTime)) {
    if (!enforced) {
      console.warn('[agenthub-proxy] Invalid timestamp format (permissive mode)');
      return { allow: true, verifiedAgentId: null, authStatus: null };
    }

    return {
      allow: false,
      response: NextResponse.json(
        { error: 'Invalid timestamp format', code: 'AUTH_INVALID_TIMESTAMP' },
        { status: 401 }
      ),
    };
  }

  if (Math.abs(Date.now() - requestTime) > TIMESTAMP_TOLERANCE_MS) {
    if (!enforced) {
      console.warn('[agenthub-proxy] Timestamp outside 30s window (permissive mode)');
      return { allow: true, verifiedAgentId: null, authStatus: null };
    }

    return {
      allow: false,
      response: NextResponse.json(
        { error: 'Timestamp expired', code: 'AUTH_EXPIRED_TIMESTAMP' },
        { status: 401 }
      ),
    };
  }

  if (!/^[0-9a-f]{64}$/.test(signature)) {
    if (!enforced) {
      console.warn('[agenthub-proxy] Invalid signature format (permissive mode)');
      return { allow: true, verifiedAgentId: null, authStatus: null };
    }

    return {
      allow: false,
      response: NextResponse.json(
        { error: 'Invalid signature format', code: 'AUTH_INVALID_SIG_FORMAT' },
        { status: 401 }
      ),
    };
  }

  return {
    allow: true,
    verifiedAgentId: agentId,
    authStatus: enforced ? 'verified-headers' : 'permissive',
  };
}

export async function proxy(request) {
  const { pathname } = request.nextUrl;
  const authResult = validateAgenthubAuth(request);

  if (!authResult.allow) {
    return authResult.response;
  }

  let response;

  // Rate Limiting para APIs
  if (pathname.startsWith('/api') && ratelimit) {
    const ip = request.headers.get('x-forwarded-for') ?? '127.0.0.1';
    const { success } = await ratelimit.limit(ip);
    if (!success) {
      return new NextResponse('Too Many Requests', { status: 429 });
    }
  }

  // Keep API handlers slashless: with trailingSlash=true, Next redirects
  // /api/foo -> /api/foo/ and app router API endpoints can 404 on that form.
  if (pathname.startsWith('/api/') && pathname.length > 5 && pathname.endsWith('/')) {
    const normalized = request.nextUrl.clone();
    normalized.pathname = pathname.replace(/\/+$/, '');
    response = NextResponse.rewrite(normalized);
  } else {
    // No auth checks — local-first, single user
    response = NextResponse.next();
  }

  if (authResult.verifiedAgentId && authResult.authStatus) {
    response.headers.set('x-agent-auth-status', authResult.authStatus);
    response.headers.set('x-agent-id-verified', authResult.verifiedAgentId);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static files and _next
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
