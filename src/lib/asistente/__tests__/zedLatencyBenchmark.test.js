'use strict';

const {
  summarizeZedLatencyRun,
  aggregateZedLatencyResults,
  formatZedLatencyMarkdownTable,
  ZED_LATENCY_MODELS,
} = require('../benchmark/zedLatencyBenchmark');

describe('zedLatencyBenchmark', () => {
  test('summarizeZedLatencyRun computes first tool timing', () => {
    const startedAt = Date.now() - 5000;
    const result = summarizeZedLatencyRun({
      startedAt,
      model: 'minimax-coding-plan/MiniMax-M3',
      scenario: 'list_terminals',
      runIndex: 1,
      turns: [
        {
          turn: 1,
          llm_ms: 4200,
          llm_at_ms: 4200,
          tools: [{ name: 'list_terminals', exec_ms: 12, at_ms: 4210 }],
        },
      ],
      success: true,
      finalText: 'Hay una terminal Chase.',
    });

    expect(result.t_total_ms).toBeGreaterThanOrEqual(5000);
    expect(result.t_first_llm_ms).toBe(4200);
    expect(result.t_first_tool_start_ms).toBe(4210);
    expect(result.t_first_tool_done_ms).toBe(4222);
    expect(result.tool_count).toBe(1);
  });

  test('aggregateZedLatencyResults median across runs', () => {
    const rows = aggregateZedLatencyResults([
      {
        model: 'minimax-coding-plan/MiniMax-M3',
        scenario: 'simple_reply',
        success: true,
        t_total_ms: 3000,
        t_first_llm_ms: 2800,
        t_first_tool_done_ms: null,
        turn_count: 1,
      },
      {
        model: 'minimax-coding-plan/MiniMax-M3',
        scenario: 'simple_reply',
        success: true,
        t_total_ms: 5000,
        t_first_llm_ms: 4800,
        t_first_tool_done_ms: null,
        turn_count: 1,
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].median_total_ms).toBe(4000);
    expect(rows[0].median_first_llm_ms).toBe(3800);
  });

  test('formatZedLatencyMarkdownTable includes model rows', () => {
    const md = formatZedLatencyMarkdownTable([
      {
        model: 'minimax-coding-plan/MiniMax-M2.7-highspeed',
        scenario: 'open_terminal',
        runs: 1,
        successes: 1,
        median_total_ms: 6100,
        p95_total_ms: 6100,
        median_first_llm_ms: 5900,
        median_first_tool_done_ms: 5920,
        median_turns: 1,
      },
    ]);
    expect(md).toMatch(/M2\.7-highspeed/);
    expect(md).toMatch(/6\.10s/);
  });

  test('benchmark model list includes M3, M2.7 and highspeed', () => {
    const ids = ZED_LATENCY_MODELS.map((m) => m.id);
    expect(ids).toContain('minimax-coding-plan/MiniMax-M3');
    expect(ids).toContain('minimax-coding-plan/MiniMax-M2.7');
    expect(ids).toContain('minimax-coding-plan/MiniMax-M2.7-highspeed');
  });
});
