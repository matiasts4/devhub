const mockReadPtyRuntime = jest.fn();
const mockOpenPtyLifecycle = jest.fn();
const mockAttachPtyLifecycle = jest.fn();
const mockReadPersistedSessionEvidence = jest.fn();
const mockReadNativeVteRuntimeEvidence = jest.fn();

jest.mock('./ttyServer.js', () => ({
  readPtyRuntime: mockReadPtyRuntime,
  openPtyLifecycle: mockOpenPtyLifecycle,
  attachPtyLifecycle: mockAttachPtyLifecycle,
}));

jest.mock('./sessionStore.js', () => ({
  readPersistedSessionEvidence: mockReadPersistedSessionEvidence,
}));

jest.mock('./nativeVteBridge.js', () => ({
  readNativeVteRuntimeEvidence: mockReadNativeVteRuntimeEvidence,
}));

const METHODS = ['open', 'attach', 'focus', 'resize', 'close', 'restore', 'heartbeat'];

function createBinding(overrides = {}) {
  return {
    classification: 'bound',
    workspace_id: 'ws-123',
    run_id: 'run-456',
    ...overrides,
  };
}

function createRuntimeHint(overrides = {}) {
  return {
    terminalId: 'term-123',
    ...overrides,
  };
}

function createPtyRuntime(overrides = {}) {
  return {
    provider: 'pty',
    availability: 'live',
    handle_ref: 'term-123',
    evidence: {
      terminalId: 'term-123',
      cwd: '/workspace/devhub',
      restored: false,
      opencodeSessionId: null,
    },
    ...overrides,
  };
}

function createPersistedEvidence(overrides = {}) {
  return {
    provider: 'session_store',
    availability: 'restorable',
    handle_ref: null,
    evidence: {
      terminalId: 'term-123',
      cwd: '/workspace/devhub',
      shell: '/bin/zsh',
      title: null,
      createdAt: '2026-05-20T10:00:00.000Z',
      lastSeenAt: '2026-05-20T10:10:00.000Z',
    },
    ...overrides,
  };
}

function createNativeEvidence(overrides = {}) {
  return {
    provider: 'native-vte',
    availability: 'live',
    handle_ref: 'panel-123',
    evidence: {
      panelId: 'panel-123',
      sessionId: 'ses_native_123',
      reason: null,
    },
    ...overrides,
  };
}

async function loadContract() {
  jest.resetModules();
  return require('./terminalLifecycleContract.js').terminalLifecycleContract;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockReadPtyRuntime.mockReturnValue(
    createPtyRuntime({ availability: 'missing', handle_ref: null })
  );
  mockOpenPtyLifecycle.mockReturnValue({
    outcome: 'ok',
    reason: 'runtime_handle_created',
    runtime: createPtyRuntime(),
  });
  mockAttachPtyLifecycle.mockReturnValue({
    outcome: 'ok',
    reason: 'runtime_handle_live',
    runtime: createPtyRuntime(),
  });
  mockReadPersistedSessionEvidence.mockReturnValue(
    createPersistedEvidence({ availability: 'missing', evidence: { terminalId: 'term-123' } })
  );
  mockReadNativeVteRuntimeEvidence.mockResolvedValue(
    createNativeEvidence({
      availability: 'missing',
      handle_ref: null,
      evidence: { panelId: 'panel-123', sessionId: 'ses_native_123', reason: 'probe-failed' },
    })
  );
});

describe('terminalLifecycleContract — final wiring batch', () => {
  describe.each(METHODS)('%s', (method) => {
    it('rejects runtime-only identifiers as ownership truth', async () => {
      const terminalLifecycleContract = await loadContract();

      const result = await terminalLifecycleContract[method]({
        runtimeHint: createRuntimeHint(),
      });

      expect(result).toEqual({
        outcome: 'rejected',
        reason: 'durable_binding_required',
        binding: null,
        runtime: {
          provider: null,
          availability: 'missing',
          handle_ref: null,
          evidence: null,
        },
      });
    });

    it('requires classification, workspace_id, and run_id on the durable binding', async () => {
      const terminalLifecycleContract = await loadContract();

      const result = await terminalLifecycleContract[method]({
        binding: createBinding({ workspace_id: null }),
        runtimeHint: createRuntimeHint(),
      });

      expect(result).toEqual({
        outcome: 'rejected',
        reason: 'durable_binding_required',
        binding: null,
        runtime: {
          provider: null,
          availability: 'missing',
          handle_ref: null,
          evidence: null,
        },
      });
    });
  });

  it('open uses the PTY open seam and preserves durable binding as top-level truth', async () => {
    const terminalLifecycleContract = await loadContract();
    const binding = createBinding({ classification: 'stale', extra_field: 'ignore-me' });
    const runtimeHint = createRuntimeHint({ terminalId: 'term-open' });
    mockOpenPtyLifecycle.mockReturnValueOnce({
      outcome: 'ok',
      reason: 'runtime_handle_created',
      runtime: createPtyRuntime({
        handle_ref: 'term-open',
        evidence: {
          terminalId: 'term-open',
          cwd: '/workspace/devhub',
          restored: false,
          opencodeSessionId: null,
        },
      }),
    });

    const result = await terminalLifecycleContract.open({ binding, provider: 'pty', runtimeHint });

    expect(mockOpenPtyLifecycle).toHaveBeenCalledWith({ binding, runtimeHint });
    expect(result).toEqual({
      outcome: 'ok',
      reason: 'runtime_handle_created',
      binding: {
        classification: 'stale',
        workspace_id: 'ws-123',
        run_id: 'run-456',
      },
      runtime: {
        provider: 'pty',
        availability: 'live',
        handle_ref: 'term-open',
        evidence: {
          terminalId: 'term-open',
          cwd: '/workspace/devhub',
          restored: false,
          opencodeSessionId: null,
        },
      },
    });
    expect(result.binding).not.toHaveProperty('terminalId');
    expect(result.binding).not.toHaveProperty('extra_field');
  });

  it('attach uses the PTY attach seam and never promotes runtime hints into binding', async () => {
    const terminalLifecycleContract = await loadContract();
    const binding = createBinding();
    const runtimeHint = createRuntimeHint({ terminalId: 'term-attach' });
    mockAttachPtyLifecycle.mockReturnValueOnce({
      outcome: 'degraded',
      reason: 'runtime_handle_missing',
      runtime: createPtyRuntime({
        availability: 'missing',
        handle_ref: null,
        evidence: { terminalId: 'term-attach' },
      }),
    });

    const result = await terminalLifecycleContract.attach({
      binding,
      provider: 'pty',
      runtimeHint,
    });

    expect(mockAttachPtyLifecycle).toHaveBeenCalledWith({ binding, runtimeHint });
    expect(mockOpenPtyLifecycle).not.toHaveBeenCalled();
    expect(result).toEqual({
      outcome: 'degraded',
      reason: 'runtime_handle_missing',
      binding: {
        classification: 'bound',
        workspace_id: 'ws-123',
        run_id: 'run-456',
      },
      runtime: {
        provider: 'pty',
        availability: 'missing',
        handle_ref: null,
        evidence: { terminalId: 'term-attach' },
      },
    });
  });

  it('focus reports ok only when a PTY live handle exists', async () => {
    const terminalLifecycleContract = await loadContract();
    mockReadPtyRuntime.mockReturnValueOnce(createPtyRuntime({ handle_ref: 'term-focus' }));

    const result = await terminalLifecycleContract.focus({
      binding: createBinding(),
      provider: 'pty',
      runtimeHint: createRuntimeHint({ terminalId: 'term-focus' }),
    });

    expect(mockReadPtyRuntime).toHaveBeenCalledWith({ terminalId: 'term-focus' });
    expect(result).toEqual({
      outcome: 'ok',
      reason: 'runtime_handle_live',
      binding: {
        classification: 'bound',
        workspace_id: 'ws-123',
        run_id: 'run-456',
      },
      runtime: {
        provider: 'pty',
        availability: 'live',
        handle_ref: 'term-focus',
        evidence: {
          terminalId: 'term-123',
          cwd: '/workspace/devhub',
          restored: false,
          opencodeSessionId: null,
        },
      },
    });
  });

  it('resize degrades when no PTY live handle exists', async () => {
    const terminalLifecycleContract = await loadContract();
    mockReadPtyRuntime.mockReturnValueOnce(
      createPtyRuntime({
        availability: 'missing',
        handle_ref: null,
        evidence: { terminalId: 'term-resize' },
      })
    );

    const result = await terminalLifecycleContract.resize({
      binding: createBinding(),
      provider: 'pty',
      runtimeHint: createRuntimeHint({ terminalId: 'term-resize' }),
      payload: { cols: 120, rows: 40 },
    });

    expect(result).toEqual({
      outcome: 'degraded',
      reason: 'runtime_handle_missing',
      binding: {
        classification: 'bound',
        workspace_id: 'ws-123',
        run_id: 'run-456',
      },
      runtime: {
        provider: 'pty',
        availability: 'missing',
        handle_ref: null,
        evidence: { terminalId: 'term-resize' },
      },
    });
    expect(mockOpenPtyLifecycle).not.toHaveBeenCalled();
    expect(mockAttachPtyLifecycle).not.toHaveBeenCalled();
  });

  it('close degrades on stale native runtime evidence', async () => {
    const terminalLifecycleContract = await loadContract();
    mockReadNativeVteRuntimeEvidence.mockResolvedValueOnce(
      createNativeEvidence({
        availability: 'stale',
        handle_ref: null,
        evidence: {
          panelId: 'panel-close',
          sessionId: 'ses_native_close',
          reason: 'panel-not-active',
        },
      })
    );

    const result = await terminalLifecycleContract.close({
      binding: createBinding(),
      provider: 'native-vte',
      runtimeHint: { panelId: 'panel-close', sessionId: 'ses_native_close' },
    });

    expect(result).toEqual({
      outcome: 'degraded',
      reason: 'runtime_handle_stale',
      binding: {
        classification: 'bound',
        workspace_id: 'ws-123',
        run_id: 'run-456',
      },
      runtime: {
        provider: 'native-vte',
        availability: 'stale',
        handle_ref: null,
        evidence: {
          panelId: 'panel-close',
          sessionId: 'ses_native_close',
          reason: 'panel-not-active',
        },
      },
    });
  });

  it('restore prefers live PTY runtime before persisted evidence', async () => {
    const terminalLifecycleContract = await loadContract();
    mockReadPtyRuntime.mockReturnValueOnce(createPtyRuntime({ handle_ref: 'term-restore-live' }));

    const result = await terminalLifecycleContract.restore({
      binding: createBinding({ classification: 'stale' }),
      provider: 'pty',
      runtimeHint: createRuntimeHint({ terminalId: 'term-restore-live' }),
    });

    expect(mockReadPersistedSessionEvidence).not.toHaveBeenCalled();
    expect(result).toEqual({
      outcome: 'ok',
      reason: 'runtime_handle_live',
      binding: {
        classification: 'stale',
        workspace_id: 'ws-123',
        run_id: 'run-456',
      },
      runtime: {
        provider: 'pty',
        availability: 'live',
        handle_ref: 'term-restore-live',
        evidence: {
          terminalId: 'term-123',
          cwd: '/workspace/devhub',
          restored: false,
          opencodeSessionId: null,
        },
      },
    });
  });

  it('restore falls back to persisted restorable session evidence', async () => {
    const terminalLifecycleContract = await loadContract();
    mockReadPtyRuntime.mockReturnValueOnce(
      createPtyRuntime({
        availability: 'missing',
        handle_ref: null,
        evidence: { terminalId: 'term-restore' },
      })
    );
    mockReadPersistedSessionEvidence.mockReturnValueOnce(
      createPersistedEvidence({
        evidence: {
          terminalId: 'term-restore',
          cwd: '/workspace/devhub',
          shell: '/bin/zsh',
          title: 'Restore Me',
          createdAt: '2026-05-20T10:00:00.000Z',
          lastSeenAt: '2026-05-20T10:10:00.000Z',
        },
      })
    );

    const result = await terminalLifecycleContract.restore({
      binding: createBinding({ classification: 'stale' }),
      provider: 'pty',
      runtimeHint: createRuntimeHint({ terminalId: 'term-restore' }),
    });

    expect(mockReadPersistedSessionEvidence).toHaveBeenCalledWith({ terminalId: 'term-restore' });
    expect(result).toEqual({
      outcome: 'ok',
      reason: 'runtime_restorable',
      binding: {
        classification: 'stale',
        workspace_id: 'ws-123',
        run_id: 'run-456',
      },
      runtime: {
        provider: 'session_store',
        availability: 'restorable',
        handle_ref: null,
        evidence: {
          terminalId: 'term-restore',
          cwd: '/workspace/devhub',
          shell: '/bin/zsh',
          title: 'Restore Me',
          createdAt: '2026-05-20T10:00:00.000Z',
          lastSeenAt: '2026-05-20T10:10:00.000Z',
        },
      },
    });
  });

  it('restore degrades when persisted evidence is stale', async () => {
    const terminalLifecycleContract = await loadContract();
    mockReadPtyRuntime.mockReturnValueOnce(
      createPtyRuntime({
        availability: 'missing',
        handle_ref: null,
        evidence: { terminalId: 'term-stale' },
      })
    );
    mockReadPersistedSessionEvidence.mockReturnValueOnce(
      createPersistedEvidence({
        availability: 'stale',
        evidence: {
          terminalId: 'term-stale',
          cwd: '/workspace/devhub',
          shell: '/bin/zsh',
          title: null,
          createdAt: '2026-05-01T09:00:00.000Z',
          lastSeenAt: '2026-05-01T09:00:00.000Z',
        },
      })
    );

    const result = await terminalLifecycleContract.restore({
      binding: createBinding({ classification: 'stale' }),
      provider: 'pty',
      runtimeHint: createRuntimeHint({ terminalId: 'term-stale' }),
    });

    expect(result).toEqual({
      outcome: 'degraded',
      reason: 'runtime_handle_stale',
      binding: {
        classification: 'stale',
        workspace_id: 'ws-123',
        run_id: 'run-456',
      },
      runtime: {
        provider: 'session_store',
        availability: 'stale',
        handle_ref: null,
        evidence: {
          terminalId: 'term-stale',
          cwd: '/workspace/devhub',
          shell: '/bin/zsh',
          title: null,
          createdAt: '2026-05-01T09:00:00.000Z',
          lastSeenAt: '2026-05-01T09:00:00.000Z',
        },
      },
    });
  });

  it('heartbeat reports persisted evidence only and never opens or attaches', async () => {
    const terminalLifecycleContract = await loadContract();
    mockReadPtyRuntime.mockReturnValueOnce(
      createPtyRuntime({
        availability: 'missing',
        handle_ref: null,
        evidence: { terminalId: 'term-heartbeat' },
      })
    );
    mockReadPersistedSessionEvidence.mockReturnValueOnce(
      createPersistedEvidence({
        availability: 'stale',
        evidence: {
          terminalId: 'term-heartbeat',
          cwd: '/workspace/devhub',
          shell: '/bin/zsh',
          title: null,
          createdAt: '2026-05-01T09:00:00.000Z',
          lastSeenAt: '2026-05-01T09:00:00.000Z',
        },
      })
    );

    const result = await terminalLifecycleContract.heartbeat({
      binding: createBinding(),
      provider: 'pty',
      runtimeHint: createRuntimeHint({ terminalId: 'term-heartbeat' }),
    });

    expect(mockOpenPtyLifecycle).not.toHaveBeenCalled();
    expect(mockAttachPtyLifecycle).not.toHaveBeenCalled();
    expect(result).toEqual({
      outcome: 'degraded',
      reason: 'runtime_handle_stale',
      binding: {
        classification: 'bound',
        workspace_id: 'ws-123',
        run_id: 'run-456',
      },
      runtime: {
        provider: 'session_store',
        availability: 'stale',
        handle_ref: null,
        evidence: {
          terminalId: 'term-heartbeat',
          cwd: '/workspace/devhub',
          shell: '/bin/zsh',
          title: null,
          createdAt: '2026-05-01T09:00:00.000Z',
          lastSeenAt: '2026-05-01T09:00:00.000Z',
        },
      },
    });
  });

  it('heartbeat reports live native evidence without mutating ownership truth', async () => {
    const terminalLifecycleContract = await loadContract();
    mockReadNativeVteRuntimeEvidence.mockResolvedValueOnce(
      createNativeEvidence({
        handle_ref: 'panel-heartbeat',
        evidence: {
          panelId: 'panel-heartbeat',
          sessionId: 'ses_native_heartbeat',
          reason: null,
        },
      })
    );

    const result = await terminalLifecycleContract.heartbeat({
      binding: createBinding(),
      provider: 'native-vte',
      runtimeHint: { panelId: 'panel-heartbeat', sessionId: 'ses_native_heartbeat' },
    });

    expect(result).toEqual({
      outcome: 'ok',
      reason: 'runtime_handle_live',
      binding: {
        classification: 'bound',
        workspace_id: 'ws-123',
        run_id: 'run-456',
      },
      runtime: {
        provider: 'native-vte',
        availability: 'live',
        handle_ref: 'panel-heartbeat',
        evidence: {
          panelId: 'panel-heartbeat',
          sessionId: 'ses_native_heartbeat',
          reason: null,
        },
      },
    });
  });

  it('stays inside the frozen MVP boundary', async () => {
    const terminalLifecycleContract = await loadContract();

    expect(Object.keys(terminalLifecycleContract).sort()).toEqual(METHODS.slice().sort());

    const result = await terminalLifecycleContract.open({
      binding: createBinding(),
      provider: 'pty',
      runtimeHint: createRuntimeHint(),
    });

    expect(result).not.toHaveProperty('ui');
    expect(result).not.toHaveProperty('dispatch');
    expect(result).not.toHaveProperty('orchestration');
    expect(result).not.toHaveProperty('ownership_table');
    expect(result).not.toHaveProperty('terminal_session_binding');
  });
});
