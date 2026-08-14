/**
 * Visual thrash SLA — shared thresholds for probe / future CI.
 * A "normal" terminales session (no intentional HMR) should stay under these.
 */

export const VISUAL_THRASH_SLA = {
  /** Times New Roman / shell-flex-lost after FOUC shield is loaded */
  maxShellFlexLostPerSession: 0,
  /** --surface-app missing while shield is present */
  maxCssVarMissingPerSession: 0,
  /** Soft layout events should not produce longtasks above this often */
  longTaskWarnMs: 200,
  /** Absolute ceiling before logging budget-exceeded style noise */
  longTaskCriticalMs: 500,
  /** Hot-window pizarra-mode-exit during pure workspace-switch is a regression */
  maxSpuriousPizarraExitPerSwitch: 0,
};

/**
 * @param {{ shellFlexLost?: number, cssVarMissing?: number, timesNewRoman?: number }} counts
 * @returns {{ ok: boolean, violations: string[] }}
 */
export function evaluateVisualThrashSla(counts = {}) {
  const violations = [];
  if ((counts.shellFlexLost || 0) > VISUAL_THRASH_SLA.maxShellFlexLostPerSession) {
    violations.push('shell-flex-lost');
  }
  if ((counts.cssVarMissing || 0) > VISUAL_THRASH_SLA.maxCssVarMissingPerSession) {
    violations.push('css-var-missing');
  }
  if ((counts.timesNewRoman || 0) > 0) {
    violations.push('times-new-roman');
  }
  return { ok: violations.length === 0, violations };
}
