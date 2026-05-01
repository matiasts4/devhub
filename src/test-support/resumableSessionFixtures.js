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

module.exports = {
  createOpenCodeRouteSession,
  createResumableCatalogError,
  createResumableSession,
};
