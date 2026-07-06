const OPENCODE_PROVIDER = 'opencode';

function normalizeUpdatedAt(value) {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString();
}

export function createResumableSessionKey(session) {
  const provider = String(session?.provider || '').trim();
  const sessionId = String(session?.sessionId || '').trim();
  return `${provider}:${sessionId}`;
}

export function normalizeOpenCodeSession(session = {}) {
  const sessionId = String(session?.sessionId || session?.id || '').trim();
  if (!sessionId) return null;

  const cwd = session?.cwd || session?.directory || null;
  const activePanelId = session?.activePanelId || null;

  return {
    provider: OPENCODE_PROVIDER,
    sessionId,
    title:
      typeof session?.title === 'string' && session.title.trim() ? session.title.trim() : sessionId,
    cwd: typeof cwd === 'string' && cwd.trim() ? cwd.trim() : null,
    updatedAt: normalizeUpdatedAt(session?.updatedAt || session?.updated || session?.lastUpdatedAt),
    isActive: Boolean(session?.isActive || activePanelId),
    activePanelId,
    resumeCommand: `opencode --session ${sessionId}`,
    durable: true,
  };
}

function sortNewestFirst(left, right) {
  const leftTs = left?.updatedAt ? new Date(left.updatedAt).getTime() : 0;
  const rightTs = right?.updatedAt ? new Date(right.updatedAt).getTime() : 0;
  return rightTs - leftTs;
}

export function mergeResumableCatalogResults(results = []) {
  const sessions = [];
  let firstError = null;

  for (const result of results) {
    if (!result) continue;
    if (result.status === 'error' && !firstError) {
      firstError = result.error || null;
    }
    if (Array.isArray(result.sessions)) {
      sessions.push(...result.sessions.filter(Boolean));
    }
  }

  const deduped = [];
  const seen = new Set();

  sessions
    .slice()
    .sort(sortNewestFirst)
    .forEach((session) => {
      const key = createResumableSessionKey(session);
      if (!session?.provider || !session?.sessionId || seen.has(key)) return;
      seen.add(key);
      deduped.push(session);
    });

  if (deduped.length > 0) {
    return { status: 'success', sessions: deduped, error: null };
  }

  if (firstError) {
    return { status: 'error', sessions: [], error: firstError };
  }

  return { status: 'empty', sessions: [], error: null };
}

export const openCodeResumableSessionAdapter = {
  id: OPENCODE_PROVIDER,
  supportsDurableResume() {
    return true;
  },
  buildResumeCommand(session) {
    return `opencode --session ${session.sessionId}`;
  },
  async listSessions({ cwd, fetchImpl = fetch } = {}) {
    const params = cwd ? `?cwd=${encodeURIComponent(cwd)}` : '';
    const response = await fetchImpl(`/api/opencode/sessions${params}`, { cache: 'no-store' });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      return {
        provider: OPENCODE_PROVIDER,
        status: 'error',
        sessions: [],
        error: payload?.error || {
          code: 'request-failed',
          message: 'OpenCode sessions could not be loaded.',
          retryable: true,
        },
      };
    }

    const normalizedSessions = Array.isArray(payload?.sessions)
      ? payload.sessions.map(normalizeOpenCodeSession).filter(Boolean)
      : [];

    return {
      provider: OPENCODE_PROVIDER,
      status: payload?.status || (normalizedSessions.length ? 'success' : 'empty'),
      sessions: normalizedSessions,
      error: payload?.error || null,
    };
  },
};

/** Placeholder until Grok CLI list+resume is verified — never auto-resumes on startup. */
export const grokResumableSessionAdapter = {
  id: 'grok',
  supportsDurableResume() {
    return false;
  },
  buildResumeCommand() {
    return null;
  },
  async listSessions() {
    return { provider: 'grok', status: 'empty', sessions: [], error: null };
  },
};

/** Placeholder until Kimi/KimiCode CLI list+resume is verified. */
export const kimiResumableSessionAdapter = {
  id: 'kimi',
  supportsDurableResume() {
    return false;
  },
  buildResumeCommand() {
    return null;
  },
  async listSessions() {
    return { provider: 'kimi', status: 'empty', sessions: [], error: null };
  },
};

export function getResumableSessionAdapters() {
  return [openCodeResumableSessionAdapter].filter((adapter) => adapter.supportsDurableResume());
}

export function getPlaceholderResumableSessionAdapters() {
  return [grokResumableSessionAdapter, kimiResumableSessionAdapter];
}
