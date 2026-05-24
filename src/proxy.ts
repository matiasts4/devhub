import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

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

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Keep API handlers slashless: with trailingSlash=true, Next redirects
  // /api/foo -> /api/foo/ and app router API endpoints can 404 on that form.
  if (pathname.startsWith('/api/') && pathname.length > 5 && pathname.endsWith('/')) {
    const normalized = request.nextUrl.clone();
    normalized.pathname = pathname.replace(/\/+$/, '');
    return NextResponse.rewrite(normalized);
  }

  // Rate Limiting para APIs
  if (pathname.startsWith('/api') && ratelimit) {
    const ip = request.headers.get('x-forwarded-for') ?? '127.0.0.1';
    const { success } = await ratelimit.limit(ip);
    if (!success) {
      return new NextResponse('Too Many Requests', { status: 429 });
    }
  }

  // No auth checks — local-first, single user
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static files and _next
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
