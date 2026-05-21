import { NextResponse } from 'next/server';
import { execFile } from 'child_process';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const OPENCODE_PROVIDER = 'opencode';
const CLI_TIMEOUT_MS = 10000;
const CLI_MAX_COUNT = 20;

function createResponse(status, sessions = [], error = null) {
  const body = {
    provider: OPENCODE_PROVIDER,
    status,
    sessions,
  };

  if (error) {
    body.error = error;
  }

  return body;
}

function createError(code, message, retryable) {
  return { code, message, retryable };
}

function normalizeSessionsPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.sessions)) return payload.sessions;
  return [];
}

function normalizeTimestamp(session) {
  const candidate = session?.updatedAt || session?.updated || session?.lastUpdatedAt || null;
  if (!candidate) return null;

  const parsed = new Date(candidate).getTime();
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString();
}

function normalizeSession(session, activeSessionIds) {
  const sessionId = String(session?.id || session?.sessionId || '').trim();
  if (!sessionId) return null;

  const cwd = session?.directory || session?.cwd || null;
  const updated = normalizeTimestamp(session);
  const activePanelId = activeSessionIds[sessionId] || null;

  return {
    id: sessionId,
    title: typeof session?.title === 'string' && session.title.trim() ? session.title.trim() : sessionId,
    directory: typeof cwd === 'string' && cwd.trim() ? cwd.trim() : null,
    updated,
    isActive: Boolean(activePanelId),
    activePanelId,
  };
}

function sortNewestFirst(left, right) {
  const leftTs = left?.updated ? new Date(left.updated).getTime() : 0;
  const rightTs = right?.updated ? new Date(right.updated).getTime() : 0;
  return rightTs - leftTs;
}

function dedupeNewestFirst(sessions) {
  const seen = new Set();
  return sessions.filter((session) => {
    if (!session?.id || seen.has(session.id)) return false;
    seen.add(session.id);
    return true;
  });
}

function matchesCwd(session, cwdFilter) {
  if (!cwdFilter) return true;
  const directory = session?.directory || '';
  return directory === cwdFilter || directory.startsWith(`${cwdFilter}/`);
}

function mapExecError(error) {
  if (error?.code === 'ENOENT') {
    return {
      statusCode: 503,
      body: createResponse(
        'error',
        [],
        createError('unavailable', 'OpenCode CLI is not available.', false)
      ),
    };
  }

  if (error?.code === 'ETIMEDOUT' || error?.signal === 'SIGTERM' || error?.killed) {
    return {
      statusCode: 504,
      body: createResponse(
        'error',
        [],
        createError('timeout', 'OpenCode session listing timed out.', true)
      ),
    };
  }

  return {
    statusCode: 503,
    body: createResponse(
      'error',
      [],
      createError('list-failed', 'OpenCode session listing failed.', true)
    ),
  };
}

function execFileWithTimeout(file, args, options) {
  return new Promise((resolve, reject) => {
    execFile(file, args, options, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function getActiveSessionMap() {
  try {
    const { getActiveOpenCodeSessionIds } = await import('@/lib/terminal/ttyServer');
    const byTerminal = getActiveOpenCodeSessionIds();
    return Object.entries(byTerminal || {}).reduce((acc, [panelId, sessionId]) => {
      if (sessionId) {
        acc[sessionId] = panelId;
      }
      return acc;
    }, {});
  } catch {
    return {};
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const cwdFilter = searchParams.get('cwd') || null;

  try {
    const { stdout } = await execFileWithTimeout(
      'opencode',
      ['session', 'list', '--format', 'json', '--max-count', String(CLI_MAX_COUNT)],
      { timeout: CLI_TIMEOUT_MS }
    );

    let parsed;
    try {
      parsed = stdout?.trim() ? JSON.parse(stdout) : [];
    } catch {
      return NextResponse.json(
        createResponse(
          'error',
          [],
          createError('invalid-json', 'OpenCode returned malformed session data.', true)
        ),
        { status: 502 }
      );
    }

    const activeSessionIds = await getActiveSessionMap();
    const sessions = dedupeNewestFirst(
      normalizeSessionsPayload(parsed)
        .map((session) => normalizeSession(session, activeSessionIds))
        .filter(Boolean)
        .filter((session) => matchesCwd(session, cwdFilter))
        .sort(sortNewestFirst)
    ).slice(0, CLI_MAX_COUNT);

    const status = sessions.length > 0 ? 'success' : 'empty';
    return NextResponse.json(createResponse(status, sessions));
  } catch (error) {
    console.error('Failed to list OpenCode sessions:', error);
    const mapped = mapExecError(error);
    return NextResponse.json(mapped.body, { status: mapped.statusCode });
  }
}
