/**
 * Zed latency benchmark — measures time from user message to tool execution.
 * Used by scripts/benchmark-zed-models.mjs and unit tests.
 */

export const ZED_LATENCY_MODELS = Object.freeze([
  {
    id: 'minimax-coding-plan/MiniMax-M3',
    label: 'M3 (actual en route.js)',
    role: 'default',
  },
  {
    id: 'minimax-coding-plan/MiniMax-M2.7',
    label: 'M2.7 estándar',
    role: 'baseline',
  },
  {
    id: 'minimax-coding-plan/MiniMax-M2.7-highspeed',
    label: 'M2.7 highspeed',
    role: 'candidate',
  },
]);

export const ZED_LATENCY_SCENARIOS = Object.freeze([
  {
    id: 'simple_reply',
    message: 'Respondé solo con la palabra listo.',
    description: 'Respuesta texto sin tools (solo LLM)',
    maxTurns: 1,
  },
  {
    id: 'list_terminals',
    message: '¿Qué terminales hay abiertas? Usá list_terminals.',
    description: '1 tool: list_terminals',
    maxTurns: 2,
  },
  {
    id: 'open_terminal',
    message: 'Abrí una terminal nueva vacía en el workspace.',
    description: '1 tool: open_terminal (client dispatch stub)',
    maxTurns: 2,
  },
]);

/**
 * @typedef {{
 *   turn: number,
 *   llm_ms: number,
 *   llm_at_ms: number,
 *   tools: Array<{ name: string, exec_ms: number, at_ms: number }>,
 * }} BenchmarkTurnTiming
 */

/**
 * @typedef {{
 *   model: string,
 *   scenario: string,
 *   runIndex: number,
 *   success: boolean,
 *   error?: string,
 *   turn_count: number,
 *   tool_count: number,
 *   t_total_ms: number,
 *   t_first_llm_ms: number | null,
 *   t_first_tool_start_ms: number | null,
 *   t_first_tool_done_ms: number | null,
 *   t_last_llm_ms: number | null,
 *   turns: BenchmarkTurnTiming[],
 *   final_text_preview?: string,
 * }} ZedLatencyResult
 */

/**
 * Build timing summary from collected events.
 * @param {object} params
 * @param {number} params.startedAt
 * @param {string} params.model
 * @param {string} params.scenario
 * @param {number} params.runIndex
 * @param {BenchmarkTurnTiming[]} params.turns
 * @param {boolean} params.success
 * @param {string} [params.error]
 * @param {string} [params.finalText]
 * @returns {ZedLatencyResult}
 */
export function summarizeZedLatencyRun({
  startedAt,
  model,
  scenario,
  runIndex,
  turns,
  success,
  error,
  finalText = '',
}) {
  const tEnd = Date.now();
  const tTotal = tEnd - startedAt;
  const firstLlm = turns[0]?.llm_ms ?? null;
  const lastLlm = turns.length ? turns[turns.length - 1].llm_ms : null;
  let firstToolStart = null;
  let firstToolDone = null;
  let toolCount = 0;

  for (const turn of turns) {
    for (const tool of turn.tools || []) {
      toolCount += 1;
      if (firstToolStart == null) firstToolStart = tool.at_ms;
      firstToolDone = tool.at_ms + tool.exec_ms;
    }
  }

  return {
    model,
    scenario,
    runIndex,
    success,
    error,
    turn_count: turns.length,
    tool_count: toolCount,
    t_total_ms: tTotal,
    t_first_llm_ms: firstLlm,
    t_first_tool_start_ms: firstToolStart,
    t_first_tool_done_ms: firstToolDone,
    t_last_llm_ms: lastLlm,
    turns,
    final_text_preview: finalText ? finalText.slice(0, 120) : '',
  };
}

/**
 * Aggregate multiple runs per model/scenario (median + p95).
 * @param {ZedLatencyResult[]} results
 */
export function aggregateZedLatencyResults(results) {
  const byKey = new Map();
  for (const r of results) {
    const key = `${r.model}::${r.scenario}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(r);
  }

  const rows = [];
  for (const [key, list] of byKey.entries()) {
    const [model, scenario] = key.split('::');
    const ok = list.filter((r) => r.success);
    const nums = (field) =>
      ok.map((r) => r[field]).filter((n) => typeof n === 'number' && Number.isFinite(n)).sort((a, b) => a - b);
    const median = (arr) => {
      if (!arr.length) return null;
      const mid = Math.floor(arr.length / 2);
      return arr.length % 2 ? arr[mid] : Math.round((arr[mid - 1] + arr[mid]) / 2);
    };
    const p95 = (arr) => {
      if (!arr.length) return null;
      const idx = Math.min(arr.length - 1, Math.ceil(arr.length * 0.95) - 1);
      return arr[idx];
    };

    rows.push({
      model,
      scenario,
      runs: list.length,
      successes: ok.length,
      median_total_ms: median(nums('t_total_ms')),
      p95_total_ms: p95(nums('t_total_ms')),
      median_first_llm_ms: median(nums('t_first_llm_ms')),
      median_first_tool_done_ms: median(nums('t_first_tool_done_ms')),
      median_turns: median(ok.map((r) => r.turn_count)),
    });
  }
  return rows.sort((a, b) => a.model.localeCompare(b.model) || a.scenario.localeCompare(b.scenario));
}

/**
 * Markdown table for human-readable comparison.
 * @param {ReturnType<typeof aggregateZedLatencyResults>} aggregated
 */
export function formatZedLatencyMarkdownTable(aggregated) {
  const header =
    '| Model | Escenario | Runs OK | Total mediana | Total p95 | 1er LLM mediana | 1er tool listo mediana | Turnos mediana |';
  const sep = '|---|---|---:|---:|---:|---:|---:|---:|';
  const lines = [header, sep];
  for (const row of aggregated) {
    lines.push(
      `| ${row.model.replace('minimax-coding-plan/', '')} | ${row.scenario} | ${row.successes}/${row.runs} | ${fmtMs(row.median_total_ms)} | ${fmtMs(row.p95_total_ms)} | ${fmtMs(row.median_first_llm_ms)} | ${fmtMs(row.median_first_tool_done_ms)} | ${row.median_turns ?? '—'} |`
    );
  }
  return lines.join('\n');
}

function fmtMs(v) {
  if (v == null) return '—';
  return `${(v / 1000).toFixed(2)}s`;
}

export default {
  ZED_LATENCY_MODELS,
  ZED_LATENCY_SCENARIOS,
  summarizeZedLatencyRun,
  aggregateZedLatencyResults,
  formatZedLatencyMarkdownTable,
};
