export const DEFAULT_CONTEXT_WINDOW_TOKENS = 200000;

const KNOWN_CONTEXT_WINDOWS = [
  { pattern: /(claude|haiku|sonnet|opus)/i, size: 200000 },
  { pattern: /(gemini\s*2\.5|gemini-2\.5)/i, size: 1048576 },
  { pattern: /(gpt\s*5|gpt\s*4\.1|gpt\s*4o|codex)/i, size: 128000 },
];

function normalizeModelName(model) {
  if (typeof model !== 'string') return '';

  return model
    .trim()
    .replace(/^models\//i, '')
    .replace(/^[^/]+\//, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function firstKnownContextWindow(...models) {
  for (const candidate of models) {
    const normalized = normalizeModelName(candidate);
    if (!normalized) continue;

    const match = KNOWN_CONTEXT_WINDOWS.find(({ pattern }) => pattern.test(normalized));
    if (match) return match.size;
  }

  return null;
}

function toFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function hasFiniteNumber(value) {
  return toFiniteNumber(value) !== null;
}

function normalizeOptions(optionsOrModel = null) {
  if (typeof optionsOrModel === 'string' || optionsOrModel == null) {
    return {
      model: typeof optionsOrModel === 'string' ? optionsOrModel : null,
    };
  }

  return optionsOrModel;
}

function resolveUsageModels(usage = {}, options = {}) {
  const transportModel = usage.transport_model || options.transportModel || null;
  const displayModel =
    usage.display_model || options.displayModel || usage.model || options.model || null;

  return {
    provider: usage.provider || options.provider || null,
    displayModel,
    transportModel,
    model: displayModel || transportModel || null,
  };
}

export function normalizeContextUtilization(value) {
  const numeric = toFiniteNumber(value);
  if (numeric === null) return 0;
  if (numeric > 0 && numeric <= 1) return numeric * 100;
  return numeric;
}

export function resolveContextWindowSize(usage = {}, model = null) {
  const options = normalizeOptions(model);
  const explicitWindow = toFiniteNumber(usage.context_window_size);
  if (explicitWindow && explicitWindow > 0) return explicitWindow;

  const { displayModel, transportModel } = resolveUsageModels(usage, options);
  const knownWindow = firstKnownContextWindow(displayModel, transportModel, options.model);
  if (knownWindow) return knownWindow;

  return DEFAULT_CONTEXT_WINDOW_TOKENS;
}

export function getContextUsageTone(utilizationPct) {
  if (utilizationPct > 80) return 'danger';
  if (utilizationPct >= 50) return 'warn';
  return 'safe';
}

export function resolveContextUsage(usage = {}, options = {}) {
  const resolvedOptions = normalizeOptions(options);
  const { provider, displayModel, transportModel, model } = resolveUsageModels(
    usage,
    resolvedOptions
  );
  const totalTokens = Math.max(
    0,
    toFiniteNumber(usage.total_tokens) ??
      (toFiniteNumber(usage.prompt_tokens) || 0) + (toFiniteNumber(usage.completion_tokens) || 0)
  );
  const contextWindowSize = resolveContextWindowSize(usage, resolvedOptions);

  let contextUtilization = normalizeContextUtilization(usage.context_utilization);
  if (contextUtilization <= 0 && contextWindowSize > 0) {
    contextUtilization = (totalTokens / contextWindowSize) * 100;
  }

  contextUtilization = Math.min(Math.max(contextUtilization, 0), 100);

  return {
    ...usage,
    provider,
    model,
    display_model: displayModel,
    transport_model: transportModel,
    prompt_tokens: Math.max(0, toFiniteNumber(usage.prompt_tokens) || 0),
    completion_tokens: Math.max(0, toFiniteNumber(usage.completion_tokens) || 0),
    total_tokens: totalTokens,
    current_context_tokens: totalTokens,
    context_window_size: contextWindowSize,
    context_utilization: Number(contextUtilization.toFixed(1)),
    context_tone: getContextUsageTone(contextUtilization),
  };
}

export function mergeSessionUsage(baseUsage = {}, liveUsage = {}, options = {}) {
  const resolvedOptions = normalizeOptions(options);
  const liveTotalTokens = Math.max(
    0,
    toFiniteNumber(liveUsage.total_tokens) ??
      (toFiniteNumber(liveUsage.prompt_tokens) || 0) +
        (toFiniteNumber(liveUsage.completion_tokens) || 0)
  );

  const hasLiveTotals = liveTotalTokens > 0;
  if (!hasLiveTotals) {
    return resolveContextUsage(baseUsage, resolvedOptions);
  }

  const merged = {
    ...baseUsage,
    ...liveUsage,
    display_model:
      liveUsage.display_model || baseUsage.display_model || resolvedOptions.displayModel || null,
    transport_model:
      liveUsage.transport_model ||
      baseUsage.transport_model ||
      resolvedOptions.transportModel ||
      null,
    model:
      liveUsage.display_model ||
      liveUsage.model ||
      baseUsage.display_model ||
      baseUsage.model ||
      null,
  };

  if (hasFiniteNumber(liveUsage.context_window_size)) {
    merged.context_window_size = liveUsage.context_window_size;
  } else {
    delete merged.context_window_size;
  }

  if (!hasFiniteNumber(liveUsage.context_utilization)) {
    delete merged.context_utilization;
  }

  return resolveContextUsage(merged, resolvedOptions);
}
