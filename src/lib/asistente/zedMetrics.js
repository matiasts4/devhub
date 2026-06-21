/**
 * Zed metrics — lightweight telemetry for the assistant/agent evolution.
 *
 * Tracks:
 * - Intent routing: tier, confidence, matcher.
 * - Fast path: hit/miss, duration, steps.
 * - Chat round-trip: total duration, model used, errors.
 *
 * Storage: localStorage (client-only), capped to MAX_ENTRIES.
 */

const STORAGE_KEY = 'devhub-zed-metrics';
const MAX_ENTRIES = 500;

function isClient() {
  if (typeof window === 'undefined' || typeof document === 'undefined' || document === null) {
    return false;
  }
  try {
    return Boolean(window.localStorage);
  } catch {
    return false;
  }
}

function readStorage() {
  if (!isClient()) return { intents: [], fastPaths: [], roundTrips: [] };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { intents: [], fastPaths: [], roundTrips: [] };
    const parsed = JSON.parse(raw);
    return {
      intents: Array.isArray(parsed.intents) ? parsed.intents : [],
      fastPaths: Array.isArray(parsed.fastPaths) ? parsed.fastPaths : [],
      roundTrips: Array.isArray(parsed.roundTrips) ? parsed.roundTrips : [],
    };
  } catch {
    return { intents: [], fastPaths: [], roundTrips: [] };
  }
}

function writeStorage(data) {
  if (!isClient()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore quota errors
  }
}

function pushCapped(array, entry, max = MAX_ENTRIES) {
  const next = [...array, entry];
  if (next.length > max) {
    return next.slice(next.length - max);
  }
  return next;
}

function sanitizeMessage(message) {
  return typeof message === 'string' ? message.slice(0, 240) : '';
}

/**
 * Record an intent resolution event.
 * @param {object} params
 * @param {string} params.message
 * @param {'local-high'|'local-medium'|'llm'} params.tier
 * @param {number} params.confidence
 * @param {string} params.matched
 * @param {'text'|'voice'} [params.source]
 */
export function recordIntentResolution({ message, tier, confidence, matched, source = 'text' }) {
  const data = readStorage();
  const entry = {
    type: 'intent',
    message: sanitizeMessage(message),
    tier,
    confidence: Number(confidence) || 0,
    matched: String(matched || ''),
    source,
    timestamp: new Date().toISOString(),
  };
  data.intents = pushCapped(data.intents, entry);
  writeStorage(data);
}

/**
 * Record a fast path execution event.
 * @param {object} params
 * @param {string} params.intent
 * @param {number} params.durationMs
 * @param {number} params.steps
 * @param {boolean} params.hit
 * @param {boolean} [params.needsConfirmation]
 */
export function recordFastPath({ intent, durationMs, steps, hit, needsConfirmation = false }) {
  const data = readStorage();
  const entry = {
    type: 'fast_path',
    intent: String(intent || 'unknown'),
    durationMs: Number(durationMs) || 0,
    steps: Number(steps) || 0,
    hit: Boolean(hit),
    needsConfirmation: Boolean(needsConfirmation),
    timestamp: new Date().toISOString(),
  };
  data.fastPaths = pushCapped(data.fastPaths, entry);
  writeStorage(data);
}

/**
 * Record a full chat round-trip event.
 * @param {object} params
 * @param {number} params.durationMs
 * @param {string} [params.model]
 * @param {boolean} [params.fastPath]
 * @param {boolean} [params.error]
 * @param {'text'|'voice'} [params.source]
 */
export function recordChatRoundTrip({
  durationMs,
  model = null,
  fastPath = false,
  error = false,
  source = 'text',
}) {
  const data = readStorage();
  const entry = {
    type: 'round_trip',
    durationMs: Number(durationMs) || 0,
    model: model || null,
    fastPath: Boolean(fastPath),
    error: Boolean(error),
    source,
    timestamp: new Date().toISOString(),
  };
  data.roundTrips = pushCapped(data.roundTrips, entry);
  writeStorage(data);
}

function average(values) {
  if (!values.length) return 0;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

/**
 * Return a summary of collected metrics.
 */
export function getMetricsSummary() {
  const { intents, fastPaths, roundTrips } = readStorage();

  const totalIntents = intents.length;
  const localHigh = intents.filter((i) => i.tier === 'local-high').length;
  const localMedium = intents.filter((i) => i.tier === 'local-medium').length;
  const llmFallback = intents.filter((i) => i.tier === 'llm').length;

  const hitCount = fastPaths.filter((f) => f.hit).length;
  const missCount = fastPaths.filter((f) => !f.hit).length;
  const fastPathDurations = fastPaths.map((f) => f.durationMs).sort((a, b) => a - b);

  const rtDurations = roundTrips.map((r) => r.durationMs).sort((a, b) => a - b);
  const fastPathRt = roundTrips.filter((r) => r.fastPath);
  const llmRt = roundTrips.filter((r) => !r.fastPath && !r.error);
  const errorRt = roundTrips.filter((r) => r.error);

  return {
    intents: {
      total: totalIntents,
      localHigh,
      localMedium,
      llmFallback,
      hitRate: totalIntents ? Math.round(((localHigh + localMedium) / totalIntents) * 100) : 0,
    },
    fastPath: {
      total: fastPaths.length,
      hits: hitCount,
      misses: missCount,
      hitRate: fastPaths.length ? Math.round((hitCount / fastPaths.length) * 100) : 0,
      avgMs: average(fastPathDurations),
      p50Ms: percentile(fastPathDurations, 50),
      p95Ms: percentile(fastPathDurations, 95),
    },
    roundTrip: {
      total: roundTrips.length,
      fastPathCount: fastPathRt.length,
      llmCount: llmRt.length,
      errorCount: errorRt.length,
      avgMs: average(rtDurations),
      p50Ms: percentile(rtDurations, 50),
      p95Ms: percentile(rtDurations, 95),
      fastPathAvgMs: average(fastPathRt.map((r) => r.durationMs)),
      llmAvgMs: average(llmRt.map((r) => r.durationMs)),
    },
  };
}

/**
 * Clear all collected metrics.
 */
export function clearMetrics() {
  if (!isClient()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export const ZED_METRICS_STORAGE_KEY = STORAGE_KEY;
export const ZED_METRICS_MAX_ENTRIES = MAX_ENTRIES;
