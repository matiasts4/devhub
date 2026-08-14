/**
 * Minimal Kimi TUI readiness detector (CJS sidecar mirror).
 * Keep in sync with src/lib/terminal/kimiReadyMarker.js.
 */

function normalizeKimiLaunchCommand(initialCommand) {
  if (!initialCommand || typeof initialCommand !== 'string') return '';
  return initialCommand.replace(/\s*#recovery-\d+\s*$/, '').trim();
}

function isKimiLaunchCommand(initialCommand) {
  return /\bkimi\b/i.test(normalizeKimiLaunchCommand(initialCommand));
}

// Strong Kimi signals — see src/lib/terminal/kimiReadyMarker.js for rationale.
const KIMI_STRONG_SIGNALS = [
  /welcome to kimi/i,
  /kimi code cli v\d/i,
  /\]0;kimi\b/i,
  /k2(?:\.\d+)?\s+code/i,
];

// Promoting weak signals — only count toward output-based promotion in
// combination (>=2 distinct). Generic patterns (session_<hex>, thinking %)
// intentionally excluded so log noise (e.g. `pnpm electron:up`) cannot promote.
const KIMI_PROMOTING_SIGNALS = [
  /mcp\s*\/\s*status/i,
  /[⊙⊛]\s*\d+\s+mcp/i,
  /ctrl\+p\s+commands/i,
  /esc\s+interrupt/i,
];

function detectKimiStrongSignal(text) {
  if (!text || typeof text !== 'string') return false;
  return KIMI_STRONG_SIGNALS.some((re) => re.test(text));
}

function countKimiPromotingSignals(text) {
  if (!text || typeof text !== 'string') return 0;
  let count = 0;
  for (const re of KIMI_PROMOTING_SIGNALS) {
    if (re.test(text)) count += 1;
  }
  return count;
}

function detectKimiTuiReady(text) {
  if (!text || typeof text !== 'string') return false;
  if (detectKimiStrongSignal(text)) return true;
  if (countKimiPromotingSignals(text) > 0) return true;
  if (/session_[a-f0-9-]{8,}/i.test(text)) return true;
  if (/\bthinking\b/i.test(text) && /\/\s*[\d.]+%\s*\(/i.test(text)) return true;
  return false;
}

module.exports = {
  detectKimiTuiReady,
  detectKimiStrongSignal,
  countKimiPromotingSignals,
  isKimiLaunchCommand,
  normalizeKimiLaunchCommand,
};
