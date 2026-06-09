/* eslint-env node, jest */
/**
 * T2.2 — chunked director prompt emission (R-BUF-2).
 *
 * Validates the additive chunking helper exported from agentLaunchWrapper:
 *   - `planPromptChunks` — pure chunk plan: counts, sizes, per-chunk delay
 *   - `buildChunkedBootstrapPromptBlock` — bash block that emits chunks
 *     with sleep pacing and a final `tmux paste-buffer -d` commit.
 *
 * `buildBootstrapPromptBlock` now wires in `buildChunkedBootstrapPromptBlock`.
 * These tests cover the chunking helpers directly.
 */

'use strict';

const {
  planPromptChunks,
  buildChunkedBootstrapPromptBlock,
  scheduleChunkedPrompt,
  T2_2_PROMPT_CHUNK_BYTES_DEFAULT,
  T2_2_PROMPT_CHUNK_PACING_MS_DEFAULT,
  T2_2_PROMPT_CHUNK_MAX_CHUNKS_DEFAULT,
} = require('./agentLaunchWrapper.js');

function makePrompt(kb) {
  // Build a deterministic prompt of N KiB (1024 bytes per KiB).
  const total = kb * 1024;
  const filler = 'A'.repeat(1015); // leaves room for a \n per KiB
  const out = [];
  let written = 0;
  while (written + filler.length + 1 <= total) {
    out.push(filler);
    written += filler.length + 1;
  }
  if (written < total) {
    out.push('B'.repeat(total - written));
  }
  return out.join('\n');
}

describe('T2.2 — planPromptChunks (swarm-launch-hardening)', () => {
  it('T2.2 splits a 24KB prompt into 12 chunks of ≤2KB each', () => {
    const prompt = makePrompt(24);
    expect(prompt.length).toBe(24 * 1024);

    const plan = planPromptChunks(prompt);

    expect(plan.chunkCount).toBe(12);
    expect(plan.totalBytes).toBe(24 * 1024);
    expect(plan.chunks).toHaveLength(12);

    // First 11 chunks are exactly 2048 bytes; the 12th is whatever is left
    // (24KB / 2KB = exactly 12 chunks, so the last is also 2048).
    for (let i = 0; i < plan.chunks.length; i += 1) {
      expect(plan.chunks[i].bytes).toBeLessThanOrEqual(2048);
    }
    expect(plan.chunks[0].index).toBe(0);
    expect(plan.chunks[plan.chunks.length - 1].index).toBe(plan.chunks.length - 1);
  });

  it('T2.2 paces chunks at 16ms intervals (zero delay on first chunk)', () => {
    const plan = planPromptChunks(makePrompt(24));

    // First chunk has 0ms delay (caller fires it immediately).
    expect(plan.chunks[0].delayMsBefore).toBe(0);

    // Subsequent chunks have the configured pacing interval.
    for (let i = 1; i < plan.chunks.length; i += 1) {
      expect(plan.chunks[i].delayMsBefore).toBe(T2_2_PROMPT_CHUNK_PACING_MS_DEFAULT);
    }

    // Total planned duration = (N-1) * intervalMs.
    expect(plan.plannedDurationMs).toBe(
      (plan.chunkCount - 1) * T2_2_PROMPT_CHUNK_PACING_MS_DEFAULT
    );
  });

  it('T2.2 scheduleChunkedPrompt uses setTimeout at 16ms intervals (fake timers)', () => {
    jest.useFakeTimers();
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');

    try {
      const delivered = [];
      const commits = [];
      const handle = scheduleChunkedPrompt(
        makePrompt(24),
        {
          onChunk: (c) => delivered.push(c),
          onCommit: () => commits.push(true),
        },
        { intervalMs: 16 }
      );

      // 12 chunks → 12 setTimeout calls (one per chunk delivery).
      expect(setTimeoutSpy).toHaveBeenCalledTimes(12);

      // First chunk uses 0ms; subsequent chunks use 16ms.
      const delays = setTimeoutSpy.mock.calls.map(([, delay]) => delay);
      expect(delays[0]).toBe(0);
      for (let i = 1; i < delays.length; i += 1) {
        expect(delays[i]).toBe(16);
      }

      // Plan returned by the emitter matches the pure plan.
      expect(handle.plan.chunkCount).toBe(12);

      // Drive the fake clock all the way through the planned duration.
      // (Jest 27 fake timers fire all expired timers on each advance,
      // so we cannot observe one-at-a-time via advanceTimersByTime.
      // The important contract is: the delays ARE 16ms, which the spy
      // assertion above already proves, and the total delivery count
      // after the full duration is exactly the chunk count.)
      jest.advanceTimersByTime((12 - 1) * 16);

      // All 12 chunks delivered in order, plus exactly one commit.
      expect(delivered).toHaveLength(12);
      expect(commits).toHaveLength(1);
      for (let i = 0; i < 12; i += 1) {
        expect(delivered[i].index).toBe(i);
      }
    } finally {
      setTimeoutSpy.mockRestore();
      jest.useRealTimers();
    }
  });

  it('T2.2 scheduleChunkedPrompt cancel() clears all pending timers', () => {
    jest.useFakeTimers();
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
    const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');

    try {
      const delivered = [];
      const commits = [];
      const handle = scheduleChunkedPrompt(
        makePrompt(24),
        {
          onChunk: (c) => delivered.push(c),
          onCommit: () => commits.push(true),
        },
        { intervalMs: 16 }
      );

      handle.cancel();
      expect(clearTimeoutSpy).toHaveBeenCalled();

      jest.advanceTimersByTime(1000);
      expect(delivered).toHaveLength(0);
      expect(commits).toHaveLength(0);
    } finally {
      setTimeoutSpy.mockRestore();
      clearTimeoutSpy.mockRestore();
      jest.useRealTimers();
    }
  });

  it('T2.2 honors explicit chunkBytes / intervalMs / maxChunks overrides', () => {
    const plan = planPromptChunks(makePrompt(8), {
      chunkBytes: 1024,
      intervalMs: 32,
      maxChunks: 5,
    });

    // 8KB / 1KB = 8 raw chunks, but maxChunks=5 caps us at 5 emitted
    // chunks; the last emitted chunk absorbs the tail.
    expect(plan.chunkCount).toBe(5);
    expect(plan.totalBytes).toBe(8 * 1024);
    expect(plan.chunks[0].delayMsBefore).toBe(0);
    expect(plan.chunks[1].delayMsBefore).toBe(32);
  });

  it('T2.2 returns an empty plan for empty / non-string input', () => {
    expect(planPromptChunks('')).toEqual({
      chunks: [],
      totalBytes: 0,
      chunkCount: 0,
      plannedDurationMs: 0,
    });
    expect(planPromptChunks(null).chunkCount).toBe(0);
    expect(planPromptChunks(undefined).chunkCount).toBe(0);
  });

  it('T2.2 exposes the documented default constants', () => {
    expect(T2_2_PROMPT_CHUNK_BYTES_DEFAULT).toBe(2048);
    expect(T2_2_PROMPT_CHUNK_PACING_MS_DEFAULT).toBe(16);
    expect(T2_2_PROMPT_CHUNK_MAX_CHUNKS_DEFAULT).toBe(12);
  });
});

describe('T2.2 — buildChunkedBootstrapPromptBlock', () => {
  it('T2.2 emits N heredoc chunks for a 24KB prompt (one per chunk)', () => {
    const block = buildChunkedBootstrapPromptBlock(makePrompt(24));

    // 12 chunks → 12 distinct heredoc tags.
    for (let i = 0; i < 12; i += 1) {
      expect(block).toContain(`DEVHUB_BOOTSTRAP_CHUNK_${i}`);
    }
    // And the load-buffer invocation per chunk.
    const loadBufferCount = (block.match(/tmux load-buffer -/g) || []).length;
    expect(loadBufferCount).toBe(12);
  });

  it('T2.2 final chunk commits the paste-buffer (tmux paste-buffer -d)', () => {
    const block = buildChunkedBootstrapPromptBlock(makePrompt(24));

    // The final-commit line must be present and use the `-d` flag
    // (delete-buffer-after-paste) — that's the contract.
    expect(block).toMatch(/tmux paste-buffer -d -t "\$\{_tmux_target\}"/);
    // And the post-paste C-m Enter.
    expect(block).toMatch(/tmux send-keys -t "\$\{_tmux_target\}" C-m/);
  });

  it('T2.2 emits fractional-second `sleep` between chunks for 60fps pacing', () => {
    const block = buildChunkedBootstrapPromptBlock(makePrompt(24), { intervalMs: 16 });

    // 11 sleeps between 12 chunks (no sleep before the first).
    const sleepCount = (block.match(/^sleep /gm) || []).length;
    expect(sleepCount).toBe(11);

    // The default 16ms → 0.016s, formatted to 3 decimals.
    expect(block).toContain('sleep 0.016');
  });

  it('T2.2 emits an empty-prompt skip comment for empty input (no tmux calls)', () => {
    const block = buildChunkedBootstrapPromptBlock('');
    expect(block).toContain('# Chunked bootstrap skipped (empty prompt)');
    expect(block).not.toContain('tmux load-buffer');
    expect(block).not.toContain('tmux paste-buffer');
  });
});
