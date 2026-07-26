const OPENCODE_PROVIDER = 'opencode';

const RESUME_COMMAND_BUILDERS = {
  opencode: (sessionId) => `opencode --session ${sessionId}`,
  kimi: (sessionId) => `kimi --session ${sessionId}`,
  grok: (sessionId) => `grok --resume ${sessionId}`,
  codex: (sessionId) => `codex resume ${sessionId}`,
  qoder: (sessionId) => `qodercli --resume ${sessionId}`,
};

const CONTINUE_COMMANDS = {
  opencode: null,
  kimi: 'kimi --continue',
  grok: 'grok --continue',
  codex: 'codex resume --last',
  qoder: 'qodercli --continue',
};

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

/**
 * Maps a raw route/scanner session payload into the shared resumable-session
 * shape for any durable provider. Accepts both route-style keys
 * (`id`/`directory`/`updated`) and normalized keys (`sessionId`/`cwd`/`updatedAt`).
 */
export function normalizeProviderSession(provider, raw = {}) {
  const sessionId = String(raw?.sessionId || raw?.id || '').trim();
  if (!sessionId) return null;

  const cwd = raw?.cwd || raw?.directory || null;
  const activePanelId = raw?.activePanelId || null;
  const buildResume = RESUME_COMMAND_BUILDERS[provider];

  return {
    provider,
    sessionId,
    title: typeof raw?.title === 'string' && raw.title.trim() ? raw.title.trim() : sessionId,
    cwd: typeof cwd === 'string' && cwd.trim() ? cwd.trim() : null,
    updatedAt: normalizeUpdatedAt(raw?.updatedAt || raw?.updated || raw?.lastUpdatedAt),
    isActive: Boolean(raw?.isActive || activePanelId),
    activePanelId,
    resumeCommand:
      typeof raw?.resumeCommand === 'string' && raw.resumeCommand.trim()
        ? raw.resumeCommand.trim()
        : buildResume
          ? buildResume(sessionId)
          : null,
    durable: raw?.durable !== false,
  };
}

export function normalizeOpenCodeSession(session = {}) {
  return normalizeProviderSession(OPENCODE_PROVIDER, session);
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

function createHttpResumableSessionAdapter(provider) {
  return {
    id: provider,
    supportsDurableResume() {
      return true;
    },
    buildResumeCommand(session) {
      return RESUME_COMMAND_BUILDERS[provider](session.sessionId);
    },
    buildContinueCommand() {
      return CONTINUE_COMMANDS[provider] || null;
    },
    async listSessions({ cwd, fetchImpl = fetch } = {}) {
      const params = cwd ? `?cwd=${encodeURIComponent(cwd)}` : '';
      const response = await fetchImpl(`/api/${provider}/sessions${params}`, { cache: 'no-store' });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        return {
          provider,
          status: 'error',
          sessions: [],
          error: payload?.error || {
            code: 'request-failed',
            message: `${provider} sessions could not be loaded.`,
            retryable: true,
          },
        };
      }

      const normalizedSessions = Array.isArray(payload?.sessions)
        ? payload.sessions
            .map((session) => normalizeProviderSession(provider, session))
            .filter(Boolean)
        : [];

      return {
        provider,
        status: payload?.status || (normalizedSessions.length ? 'success' : 'empty'),
        sessions: normalizedSessions,
        error: payload?.error || null,
      };
    },
  };
}

export const openCodeResumableSessionAdapter = createHttpResumableSessionAdapter(OPENCODE_PROVIDER);
export const kimiResumableSessionAdapter = createHttpResumableSessionAdapter('kimi');
export const grokResumableSessionAdapter = createHttpResumableSessionAdapter('grok');
export const codexResumableSessionAdapter = createHttpResumableSessionAdapter('codex');
export const qoderResumableSessionAdapter = createHttpResumableSessionAdapter('qoder');

/** Placeholder until Claude CLI list+resume is verified — never auto-resumes on startup. */
export const claudeResumableSessionAdapter = {
  id: 'claude',
  supportsDurableResume() {
    return false;
  },
  buildResumeCommand() {
    return null;
  },
  buildContinueCommand() {
    return null;
  },
  async listSessions() {
    return { provider: 'claude', status: 'empty', sessions: [], error: null };
  },
};

export function getResumableSessionAdapters() {
  return [
    openCodeResumableSessionAdapter,
    kimiResumableSessionAdapter,
    grokResumableSessionAdapter,
    codexResumableSessionAdapter,
    qoderResumableSessionAdapter,
  ].filter((adapter) => adapter.supportsDurableResume());
}

export function getPlaceholderResumableSessionAdapters() {
  return [claudeResumableSessionAdapter].filter((adapter) => !adapter.supportsDurableResume());
}
