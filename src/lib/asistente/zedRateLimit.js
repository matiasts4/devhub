/**
 * Per-user rate limiting for the Zed assistant chat endpoint.
 *
 * Uses Upstash Redis + @upstash/ratelimit when configured; otherwise falls back
 * to a simple in-memory sliding bucket so the route still works locally.
 */

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const ANONYMOUS_USER = 'anonymous';

function resolveUpstashRatelimit() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  const redis = new Redis({ url, token });
  const limit = Number(process.env.ZED_RATE_LIMIT_CALLS) || 30;
  const windowMs = Number(process.env.ZED_RATE_LIMIT_WINDOW_MS) || 60000;
  const windowSeconds = Math.max(1, Math.round(windowMs / 1000));
  const windowStr =
    windowSeconds % 60 === 0 ? `${Math.round(windowSeconds / 60)} m` : `${windowSeconds} s`;

  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, windowStr),
    ephemeralCache: new Map(),
  });
}

const upstashRatelimit = resolveUpstashRatelimit();

/** @type {Map<string, { count: number, resetAt: number }>} */
const memoryBuckets = new Map();

function checkMemoryRateLimit(userId, limit, windowMs) {
  const now = Date.now();
  const bucket = memoryBuckets.get(userId);

  if (!bucket || now >= bucket.resetAt) {
    const resetAt = now + windowMs;
    memoryBuckets.set(userId, { count: 1, resetAt });
    return { allowed: true, limit, remaining: Math.max(0, limit - 1), resetMs: windowMs };
  }

  if (bucket.count >= limit) {
    return { allowed: false, limit, remaining: 0, resetMs: Math.max(0, bucket.resetAt - now) };
  }

  bucket.count += 1;
  return {
    allowed: true,
    limit,
    remaining: Math.max(0, limit - bucket.count),
    resetMs: Math.max(0, bucket.resetAt - now),
  };
}

/**
 * @param {string} userId
 * @param {object} [options]
 * @param {number} [options.limit]
 * @param {number} [options.windowMs]
 * @returns {Promise<{ allowed: boolean, limit: number, remaining: number, resetMs: number }>}
 */
export async function checkZedRateLimit(userId, options = {}) {
  const isAnonymous = !userId || userId === ANONYMOUS_USER;
  const envLimit = isAnonymous
    ? Number(process.env.ZED_ANON_RATE_LIMIT_CALLS) || 10
    : Number(process.env.ZED_RATE_LIMIT_CALLS) || 30;
  const limit = options.limit || envLimit;
  const windowMs = options.windowMs || Number(process.env.ZED_RATE_LIMIT_WINDOW_MS) || 60000;

  if (upstashRatelimit) {
    const {
      success,
      limit: upstashLimit,
      remaining,
      reset,
    } = await upstashRatelimit.limit(String(userId || ANONYMOUS_USER));
    return {
      allowed: success,
      limit: upstashLimit ?? limit,
      remaining: remaining ?? 0,
      resetMs: reset ?? windowMs,
    };
  }

  return checkMemoryRateLimit(String(userId || ANONYMOUS_USER), limit, windowMs);
}

export { ANONYMOUS_USER };
