# Zed Assistant — Performance (Enfoque A: medir + quick wins)

Date: 2026-07-30
Status: Approved
Approach: A — instrument to find real bottlenecks + ship safe quick wins now

## Goal

Reduce perceived latency of the Zed dock assistant across: first-response
time (TTFT), tool round-trips, and action execution. Ground fixes in
measurement rather than guessing.

## Findings that shape the plan

- Streaming is ALREADY default-on: `useZedChat.js:70` sets `streamEnabled = true`,
  sends `stream:true` + `Accept: text/event-stream`, and consumes SSE deltas.
  So TTFT work = reduce pre-first-token server work, NOT enabling streaming.
- `buildZedRegistry()` (route.js:229) rebuilds ~29 tools + filesystem skill
  discovery on EVERY request.
- Pre-LLM work is serial: `searchZedMemoriesServer` (route.js:231) blocks before
  the fast path; `checkZedRateLimit` (route.js:276) runs after; `resolveZedLlmConfig`
  (route.js:338) may do file I/O + OAuth network refresh.
- Short-circuit (`zedShortCircuit.js`) already skips the 2nd LLM turn for simple
  terminal/url tool results.

## Changes

1. **Instrumentation** — lightweight per-request timing harness in `route.js`
   marking phases: `auth`, `registry_build`, `memory_search`, `rate_limit`,
   `fast_path`, `config_resolve`, `prompt_assembly`, `context_budget`, `ttft`,
   `loop_total`, per-turn `llm_call` / `tool_exec`. Emit via existing
   `recordZedServerMetric`/`zedLog`; optionally dump to `data/logs/zed-perf/latest.json`.
2. **Cache `buildZedRegistry()`** — module-level singleton with explicit
   invalidation (skill dir rarely changes).
3. **Parallelize pre-LLM** — run memory search + rate limit concurrently
   (`Promise.all`); keep fast path early so local commands skip memory cost.
4. **Reduce LLM turns** — conservatively extend `shouldShortCircuitAfterTools`
   coverage where safe (no behavior regression).

## Non-goals (this plan)

- Rewriting the system prompt (separate "prompts" plan).
- New tools/capabilities (separate "actions" plan).
- Provider prompt-caching headers, lazy registry, real tokenizer (Approach C).

## Verification

- Unit: registry cache returns same instance; invalidation rebuilds.
- Unit: short-circuit extension cases.
- Perf marks produce a report; compare before/after on representative prompts.
- Manual: open a terminal via the assistant, confirm incremental streaming and
  faster first response.
