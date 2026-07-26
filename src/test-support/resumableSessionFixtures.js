function createResumableSession(overrides = {}) {
  const sessionId = overrides.sessionId || 'oc-1';
  return {
    provider: 'opencode',
    sessionId,
    title: `Session ${sessionId}`,
    cwd: '/workspace/devhub',
    updatedAt: '2026-04-30T10:00:00.000Z',
    isActive: false,
    activePanelId: null,
    resumeCommand: `opencode --session ${sessionId}`,
    durable: true,
    ...overrides,
  };
}

function createOpenCodeRouteSession(overrides = {}) {
  const id = overrides.id || overrides.sessionId || 'session-1';
  return {
    id,
    title: `Route ${id}`,
    directory: '/workspace/devhub',
    updated: '2026-04-30T10:00:00.000Z',
    ...overrides,
  };
}

function createResumableCatalogError(overrides = {}) {
  return {
    code: 'timeout',
    message: 'OpenCode session listing timed out.',
    retryable: true,
    ...overrides,
  };
}

const PROVIDER_RESUME_COMMANDS = {
  opencode: (id) => `opencode --session ${id}`,
  kimi: (id) => `kimi --session ${id}`,
  grok: (id) => `grok --resume ${id}`,
  codex: (id) => `codex resume ${id}`,
  qoder: (id) => `qodercli --resume ${id}`,
};

function createProviderResumableSession(provider, overrides = {}) {
  const sessionId = overrides.sessionId || `${provider}-1`;
  return {
    provider,
    sessionId,
    title: `Session ${sessionId}`,
    cwd: '/workspace/devhub',
    updatedAt: '2026-04-30T10:00:00.000Z',
    isActive: false,
    activePanelId: null,
    resumeCommand: PROVIDER_RESUME_COMMANDS[provider](sessionId),
    durable: true,
    ...overrides,
  };
}

module.exports = {
  createOpenCodeRouteSession,
  createProviderResumableSession,
  createResumableCatalogError,
  createResumableSession,
};
