# Archive Report: Retry LLM Selector Fix

**Date**: 2026-04-04
**Change**: `retry-llm-selector-fix`
**Status**: ✅ Archived

---

## Executive Summary

This change addressed two independent resilience and UX issues in the AgentHub module:

1. **Server-side retry logic** — Added exponential backoff with jitter to `openai.chat.completions.create()` calls in the chat API route, protecting against transient LLM provider failures (rate limits, overloads, network errors).
2. **Combined favorites selector** — Changed the favorites dropdown to aggregate models from ALL configured LLM providers instead of only the active one, with deduplication via `Set`.

Both changes are additive, backward-compatible, and introduce zero new npm dependencies.

---

## What Was Implemented vs What Was Planned

| Planned                                                                                                 | Implemented           | Status   |
| ------------------------------------------------------------------------------------------------------- | --------------------- | -------- |
| `isRetryableError(error)` — detect retryable errors by HTTP status (429, 500, 503) and message patterns | ✅ Implemented        | Complete |
| `parseRetryAfter(error)` — parse Retry-After header (ms, seconds, HTTP-date)                            | ✅ Implemented        | Complete |
| `callWithRetry(fn, options)` — exponential backoff (1s, 2s, 4s) with ±200ms jitter, max 3 attempts      | ✅ Implemented        | Complete |
| Wrap `openai.chat.completions.create()` with `callWithRetry`                                            | ✅ Implemented        | Complete |
| Verify non-retryable errors (401, 400, 403, 404) fail immediately                                       | ✅ Verified           | Complete |
| Combine favorites from all providers with deduplication                                                 | ✅ Implemented        | Complete |
| Pass combined list to ChatInput component                                                               | ✅ Implemented        | Complete |
| 13 tasks across 4 phases                                                                                | ✅ All 13/13 complete | Complete |

**No deviations from the original plan.** All specs, design decisions, and tasks were implemented as defined.

---

## Files Changed

| File                                 | Action   | Lines Changed                                             |
| ------------------------------------ | -------- | --------------------------------------------------------- |
| `src/app/api/agenthub/chat/route.js` | Modified | ~130 lines added (3 retry helper functions + integration) |
| `src/views/AgentHub.jsx`             | Modified | 3 lines changed (favorites aggregation logic)             |

---

## Specs Synced

| Domain                        | Action  | Details                                                                                      |
| ----------------------------- | ------- | -------------------------------------------------------------------------------------------- |
| `chat-retry-logic`            | Created | 5 requirements, 15 scenarios — copied to `openspec/specs/chat-retry-logic/spec.md`           |
| `combined-favorites-selector` | Created | 4 requirements, 9 scenarios — copied to `openspec/specs/combined-favorites-selector/spec.md` |

---

## Architecture Decisions

| Decision                                | Rationale                                                                                |
| --------------------------------------- | ---------------------------------------------------------------------------------------- |
| Retry scope limited to pre-stream only  | Stream retry requires complex state management and idempotency guarantees — out of scope |
| Jitter: ±200ms fixed                    | Sufficient for this scale; simpler than percentage-based                                 |
| Retry-After parsing: heuristic approach | Numeric < 10000 = ms, else seconds, else Date.parse() — covers all 3 formats             |
| Favorites dedup: `[...new Set(flat)]`   | Minimal, proven pattern; works since favorites are model name strings                    |
| No new dependencies                     | Both features implemented with vanilla JS — zero bundle impact                           |

---

## Recommendations for Future Work

1. **Extract `callWithRetry` to shared utility** — The design doc flagged this as an open question. If retry logic is needed in other API routes (e.g., embeddings, image generation), extract to `lib/retry.js`.
2. **Client-side retry visibility** — Consider surfacing retry attempts to the user (e.g., "Reintentando 2/3…") for transparency during long delays.
3. **Add unit tests** — The verification used inline assertions. Consider migrating to a proper test suite with mocks for `openai.chat.completions.create`.
4. **Monitor retry metrics** — Track retry frequency per provider to identify systemic issues vs transient failures.
5. **Consider circuit breaker pattern** — If a provider consistently fails, a circuit breaker could prevent wasteful retries.

---

## Archive Contents

- `proposal.md` ✅
- `design.md` ✅
- `specs/chat-retry-logic/spec.md` ✅
- `specs/combined-favorites-selector/spec.md` ✅
- `tasks.md` ✅ (13/13 complete)

---

## SDD Cycle Complete

The change has been fully planned, implemented, verified, and archived.
Ready for the next change.
