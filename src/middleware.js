import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { NextResponse } from 'next/server';

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

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  // Rate Limiting para APIs
  if (pathname.startsWith('/api') && ratelimit) {
    const ip = request.ip || '127.0.0.1';
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
