const { readPtyRuntime, openPtyLifecycle, attachPtyLifecycle } = require('./ttyServer.js');
const { readPersistedSessionEvidence } = require('./sessionStore.js');
const { readNativeVteRuntimeEvidence } = require('./nativeVteBridge.js');

const DEFAULT_RUNTIME = Object.freeze({
  provider: null,
  availability: 'missing',
  handle_ref: null,
  evidence: null,
});

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasDurableBinding(binding) {
  return Boolean(
    binding &&
    isNonEmptyString(binding.classification) &&
    isNonEmptyString(binding.workspace_id) &&
    isNonEmptyString(binding.run_id)
  );
}

function normalizeBinding(binding) {
  if (!hasDurableBinding(binding)) {
    return null;
  }

  return {
    classification: binding.classification,
    workspace_id: binding.workspace_id,
    run_id: binding.run_id,
  };
}

function normalizeRuntime(runtime) {
  if (!runtime || typeof runtime !== 'object') {
    return { ...DEFAULT_RUNTIME };
  }

  return {
    provider: runtime.provider ?? null,
    availability: runtime.availability ?? 'missing',
    handle_ref: runtime.handle_ref ?? null,
    evidence:
      runtime.evidence && typeof runtime.evidence === 'object' ? { ...runtime.evidence } : null,
  };
}

function createRejectedResult() {
  return {
    outcome: 'rejected',
    reason: 'durable_binding_required',
    binding: null,
    runtime: { ...DEFAULT_RUNTIME },
  };
}

function createLifecycleResult(binding, outcome, reason, runtime) {
  return {
    outcome,
    reason,
    binding: normalizeBinding(binding),
    runtime: normalizeRuntime(runtime),
  };
}

function resolveRuntimeStatusReason(runtime) {
  if (runtime.availability === 'live') {
    return { outcome: 'ok', reason: 'runtime_handle_live' };
  }

  if (runtime.availability === 'restorable') {
    return { outcome: 'ok', reason: 'runtime_restorable' };
  }

  if (runtime.availability === 'stale') {
    return { outcome: 'degraded', reason: 'runtime_handle_stale' };
  }

  if (runtime.availability === 'unsupported') {
    return { outcome: 'degraded', reason: 'runtime_restore_unavailable' };
  }

  return { outcome: 'degraded', reason: 'runtime_handle_missing' };
}

function readLiveRuntime(provider, runtimeHint = {}) {
  if (provider === 'native-vte') {
    return readNativeVteRuntimeEvidence(runtimeHint);
  }

  return Promise.resolve(readPtyRuntime({ terminalId: runtimeHint.terminalId }));
}

async function handleOpen(binding, runtimeHint) {
  const result = openPtyLifecycle({ binding, runtimeHint });
  return createLifecycleResult(binding, result.outcome, result.reason, result.runtime);
}

async function handleAttach(binding, runtimeHint) {
  const result = attachPtyLifecycle({ binding, runtimeHint });
  return createLifecycleResult(binding, result.outcome, result.reason, result.runtime);
}

async function handleLiveScoped(binding, provider, runtimeHint) {
  const runtime = await readLiveRuntime(provider, runtimeHint);
  const { outcome, reason } = resolveRuntimeStatusReason(runtime);
  return createLifecycleResult(binding, outcome, reason, runtime);
}

async function handleRestore(binding, provider, runtimeHint) {
  const liveRuntime = await readLiveRuntime(provider, runtimeHint);
  const liveStatus = resolveRuntimeStatusReason(liveRuntime);

  if (liveRuntime.availability === 'live') {
    return createLifecycleResult(binding, liveStatus.outcome, liveStatus.reason, liveRuntime);
  }

  if (provider === 'pty') {
    const persistedRuntime = readPersistedSessionEvidence({ terminalId: runtimeHint?.terminalId });
    const persistedStatus = resolveRuntimeStatusReason(persistedRuntime);
    return createLifecycleResult(
      binding,
      persistedStatus.outcome,
      persistedStatus.reason,
      persistedRuntime
    );
  }

  return createLifecycleResult(binding, liveStatus.outcome, liveStatus.reason, liveRuntime);
}

async function handleHeartbeat(binding, provider, runtimeHint) {
  const liveRuntime = await readLiveRuntime(provider, runtimeHint);

  if (liveRuntime.availability === 'live' || liveRuntime.availability === 'stale') {
    const liveStatus = resolveRuntimeStatusReason(liveRuntime);
    return createLifecycleResult(binding, liveStatus.outcome, liveStatus.reason, liveRuntime);
  }

  if (provider === 'pty') {
    const persistedRuntime = readPersistedSessionEvidence({ terminalId: runtimeHint?.terminalId });
    const persistedStatus = resolveRuntimeStatusReason(persistedRuntime);
    return createLifecycleResult(
      binding,
      persistedStatus.outcome,
      persistedStatus.reason,
      persistedRuntime
    );
  }

  const liveStatus = resolveRuntimeStatusReason(liveRuntime);
  return createLifecycleResult(binding, liveStatus.outcome, liveStatus.reason, liveRuntime);
}

async function executeLifecycle(method, input = {}) {
  const { binding, provider = 'pty', runtimeHint } = input;

  if (!hasDurableBinding(binding)) {
    return createRejectedResult();
  }

  if (method === 'open') {
    return handleOpen(binding, runtimeHint);
  }

  if (method === 'attach') {
    return handleAttach(binding, runtimeHint);
  }

  if (method === 'restore') {
    return handleRestore(binding, provider, runtimeHint);
  }

  if (method === 'heartbeat') {
    return handleHeartbeat(binding, provider, runtimeHint);
  }

  return handleLiveScoped(binding, provider, runtimeHint);
}

const terminalLifecycleContract = {
  open(input = {}) {
    return executeLifecycle('open', input);
  },

  attach(input = {}) {
    return executeLifecycle('attach', input);
  },

  focus(input = {}) {
    return executeLifecycle('focus', input);
  },

  resize(input = {}) {
    return executeLifecycle('resize', input);
  },

  close(input = {}) {
    return executeLifecycle('close', input);
  },

  restore(input = {}) {
    return executeLifecycle('restore', input);
  },

  heartbeat(input = {}) {
    return executeLifecycle('heartbeat', input);
  },
};

module.exports = {
  terminalLifecycleContract,
};
