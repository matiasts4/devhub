'use strict';

/**
 * Live MiniMax latency benchmark — skipped unless ZED_BENCHMARK=1.
 *
 *   ZED_BENCHMARK=1 pnpm exec jest src/lib/asistente/__tests__/zedLatencyBenchmark.live.test.js --runInBand --testTimeout=180000
 *
 * Optional:
 *   ZED_BENCHMARK_RUNS=2
 *   ZED_BENCHMARK_MODELS=M3,M2.7-highspeed
 */

import fs from 'node:fs';
import path from 'node:path';

import {
  ZED_LATENCY_MODELS,
  ZED_LATENCY_SCENARIOS,
  summarizeZedLatencyRun,
  aggregateZedLatencyResults,
  formatZedLatencyMarkdownTable,
} from '../benchmark/zedLatencyBenchmark';
import { resolveZedApiKey } from '../resolveZedApiKey';
import { runZedChatLoop } from '../runZedChatLoop';
import { ToolRegistry } from '../tools/registry';
import { terminalTool, listTerminalsTool } from '../tools/terminal';
import { BASE_URL } from '@/app/api/assistant/chat/route';

const RUN_LIVE = process.env.ZED_BENCHMARK === '1';
const RUNS = Math.max(1, parseInt(process.env.ZED_BENCHMARK_RUNS || '1', 10) || 1);
const MODEL_FILTER = (process.env.ZED_BENCHMARK_MODELS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const describeLive = RUN_LIVE ? describe : describe.skip;

async function callMinimax({ model, maxTokens, system, messages, apiKey, tools }) {
  const start = Date.now();
  const response = await fetch(BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      ...(system ? { system } : {}),
      messages,
      ...(tools?.length ? { tools } : {}),
    }),
  });
  const llm_ms = Date.now() - start;
  if (!response.ok) {
    const errText = await response.text();
    const err = new Error(`MiniMax ${response.status}: ${errText.slice(0, 300)}`);
    err.upstream_status = response.status;
    throw err;
  }
  const data = await response.json();
  data._benchmark_llm_ms = llm_ms;
  return data;
}

function buildStubRegistry() {
  const registry = new ToolRegistry();
  registry.register({
    ...listTerminalsTool,
    async execute() {
      return { processes: [{ terminalId: 'p1', displayName: 'Chase' }] };
    },
  });
  registry.register({
    ...terminalTool,
    async execute() {
      return { opened: true, workspace: true, terminalId: 'p2', displayName: 'Nova' };
    },
  });
  const noop = async () => ({ ok: true, benchmark: true });
  for (const name of [
    'execute_in_terminal',
    'close_terminal',
    'review_terminal_output',
    'summarize_terminal',
    'open_url',
    'close_url',
    'browse_files',
    'review_log_file',
    'get_swarm_status',
  ]) {
    registry.register({ name, description: `stub ${name}`, parameters: {}, execute: noop });
  }
  return registry;
}

function filterModels() {
  if (!MODEL_FILTER.length) return ZED_LATENCY_MODELS;
  return ZED_LATENCY_MODELS.filter((m) =>
    MODEL_FILTER.some((f) => m.id.toLowerCase().includes(f.toLowerCase()))
  );
}

async function runScenario({ model, scenario, apiKey, systemPrompt, runIndex }) {
  const startedAt = Date.now();
  const turns = [];
  let currentTurn = null;
  const registry = buildStubRegistry();
  const anthropicTools = registry.toAnthropicTools();
  const requestContext = {
    terminal_panel_count: 1,
    max_terminal_panels: 6,
    workspace_terminals: [{ terminalId: 'p1', displayName: 'Chase' }],
  };

  const instrumentedCallMinimax = async (args) => {
    const data = await callMinimax(args);
    currentTurn = {
      turn: turns.length + 1,
      llm_ms: data._benchmark_llm_ms ?? 0,
      llm_at_ms: Date.now() - startedAt,
      tools: [],
    };
    turns.push(currentTurn);
    return data;
  };

  const origExecute = registry.execute.bind(registry);
  registry.execute = async (name, input, context) => {
    const t0 = Date.now();
    const result = await origExecute(name, input, context);
    if (currentTurn) {
      currentTurn.tools.push({ name, exec_ms: Date.now() - t0, at_ms: Date.now() - startedAt });
    }
    return result;
  };

  try {
    const { finalText } = await runZedChatLoop({
      systemPrompt,
      conversation: [{ role: 'user', content: scenario.message }],
      registry,
      anthropicTools,
      apiKey,
      requestContext,
      maxTurns: scenario.maxTurns,
      callMinimax: instrumentedCallMinimax,
      model: model.id,
    });
    return summarizeZedLatencyRun({
      startedAt,
      model: model.id,
      scenario: scenario.id,
      runIndex,
      turns,
      success: true,
      finalText,
    });
  } catch (err) {
    return summarizeZedLatencyRun({
      startedAt,
      model: model.id,
      scenario: scenario.id,
      runIndex,
      turns,
      success: false,
      error: err.message,
    });
  }
}

describeLive('Zed model latency (live MiniMax)', () => {
  jest.setTimeout(180_000);

  test('benchmark all configured models and write report', async () => {
    const { apiKey, source } = resolveZedApiKey();
    expect(apiKey).toBeTruthy();

    const promptPath = path.join(
      process.cwd(),
      'docs/prompts/asistente/zed-system-prompt.md'
    );
    const systemPrompt = fs.readFileSync(promptPath, 'utf8');
    const models = filterModels();
    expect(models.length).toBeGreaterThan(0);

    const allResults = [];
    for (const model of models) {
      for (const scenario of ZED_LATENCY_SCENARIOS) {
        for (let run = 1; run <= RUNS; run += 1) {
           
          const result = await runScenario({
            model,
            scenario,
            apiKey,
            systemPrompt,
            runIndex: run,
          });
          allResults.push(result);
           
          console.log(
            `[${source}] ${model.id} ${scenario.id} run${run}: success=${result.success} total=${result.t_total_ms}ms tools=${result.tool_count}${result.error ? ` err=${result.error}` : ''}`
          );
        }
      }
    }

    const aggregated = aggregateZedLatencyResults(allResults);
    const md = formatZedLatencyMarkdownTable(aggregated);
     
    console.log('\n' + md);

    const outDir = path.join(process.cwd(), 'logs');
    fs.mkdirSync(outDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    fs.writeFileSync(
      path.join(outDir, `zed-latency-benchmark-${stamp}.json`),
      JSON.stringify({ aggregated, results: allResults }, null, 2)
    );

    expect(allResults.some((r) => r.success)).toBe(true);
  });
});
