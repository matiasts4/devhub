import { NextResponse } from 'next/server';
import { createResumableSessionKey, normalizeProviderSession } from './resumableSessionAdapters';

const DEFAULT_MAX_COUNT = 20;
const SCAN_TIMEOUT_MS = 10000;

function createError(code, message, retryable) {
  return { code, message, retryable };
}

function createResponse(provider, status, sessions = [], error = null) {
  const body = { provider, status, sessions };
  if (error) {
    body.error = error;
  }
  return body;
}

function normalizeCwdForCompare(value) {
  let normalized = String(value || '')
    .trim()
    .replace(/\\+/g, '/')
    .replace(/\/+$/, '');
  if (process.platform === 'win32') {
    normalized = normalized.toLowerCase();
  }
  return normalized;
}

function matchesCwd(session, cwdFilter) {
  if (!cwdFilter) return true;
  const filter = normalizeCwdForCompare(cwdFilter);
  if (!filter) return true;
  const directory = normalizeCwdForCompare(session?.cwd);
  if (!directory) return false;
  return directory === filter || directory.startsWith(`${filter}/`);
}

function sortNewestFirst(left, right) {
  const leftTs = left?.updatedAt ? new Date(left.updatedAt).getTime() : 0;
  const rightTs = right?.updatedAt ? new Date(right.updatedAt).getTime() : 0;
  return rightTs - leftTs;
}

function withTimeout(promiseFactory, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const error = new Error('Session scan timed out.');
      error.code = 'ETIMEDOUT';
      reject(error);
    }, ms);
    timer.unref?.();

    Promise.resolve()
      .then(promiseFactory)
      .then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          clearTimeout(timer);
          reject(error);
        }
      );
  });
}

/**
 * Shared GET handler for agent session-catalog routes, mirroring the OpenCode
 * route contract: normalized envelope `{ provider, status, sessions, error? }`,
 * timeout guard, dedupe by provider:sessionId, newest-first sort, `?cwd=` filter
 * and a hard cap on results.
 */
export function createSessionsRouteHandler({
  provider,
  scan,
  maxCount = DEFAULT_MAX_COUNT,
  timeoutMs = SCAN_TIMEOUT_MS,
}) {
  return async function GET(request) {
    const { searchParams } = new URL(request.url);
    const cwdFilter = searchParams.get('cwd') || null;

    try {
      const result = await withTimeout(() => scan({ cwd: cwdFilter, limit: maxCount }), timeoutMs);

      const seen = new Set();
      const sessions = (Array.isArray(result?.sessions) ? result.sessions : [])
        .map((raw) => normalizeProviderSession(provider, raw))
        .filter(Boolean)
        .filter((session) => matchesCwd(session, cwdFilter))
        .sort(sortNewestFirst)
        .filter((session) => {
          const key = createResumableSessionKey(session);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .slice(0, maxCount);

      const status = sessions.length > 0 ? 'success' : 'empty';
      return NextResponse.json(createResponse(provider, status, sessions));
    } catch (error) {
      console.error(`Failed to list ${provider} sessions:`, error);
      if (error?.code === 'ETIMEDOUT') {
        return NextResponse.json(
          createResponse(
            provider,
            'error',
            [],
            createError('timeout', `${provider} session listing timed out.`, true)
          ),
          { status: 504 }
        );
      }
      return NextResponse.json(
        createResponse(
          provider,
          'error',
          [],
          createError('list-failed', `${provider} session listing failed.`, true)
        ),
        { status: 503 }
      );
    }
  };
}
