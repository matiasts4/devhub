# Design: Retry Logic + Combined Favorites Selector

## Technical Approach

Two independent changes: (1) server-side `callWithRetry()` wrapper around `openai.chat.completions.create()` in the chat route, and (2) client-side favorites aggregation across all providers in `AgentHub.jsx`. No new dependencies, no API contract changes.

## Architecture Decisions

| Decision            | Options                                    | Trade-off                                                  | Choice                                                                      |
| ------------------- | ------------------------------------------ | ---------------------------------------------------------- | --------------------------------------------------------------------------- |
| Retry placement     | Wrapper fn vs inline try/catch loop        | Wrapper is reusable, testable, clear intent                | Standalone `callWithRetry()` helper                                         |
| Retry scope         | Pre-stream only vs full stream retry       | Stream retry = complex (partial state, idempotency)        | Pre-stream only (matches spec)                                              |
| Jitter strategy     | ±200ms fixed vs percentage-based           | Fixed is simpler, sufficient for this scale                | ±200ms random variance                                                      |
| Retry-After parsing | ms, seconds, HTTP-date                     | Must handle all 3 formats per spec                         | Parse with heuristic: numeric < 10000 = ms, else seconds, else Date.parse() |
| Favorites dedup     | `Set` on full string vs `Set` on model key | `Set<string>` works since favorites are model name strings | `[...new Set(flat)]` — minimal, proven                                      |

## Data Flow

### Retry Flow (Server)

```
POST /api/agenthub/chat
  │
  ├─ build OpenAI client (provider selection)
  ├─ build chatMessages[]
  │
  ├─ callWithRetry(() => openai.chat.completions.create({…}))
  │    │
  │    ├─ attempt 0 → create()
  │    ├─ if retryable error → wait(delay + jitter) → attempt 1
  │    ├─ if retryable error → wait(delay + jitter) → attempt 2
  │    └─ if still fails → throw (caught by outer catch)
  │
  ├─ stream response → client (no retry during stream)
  └─ error → NextResponse.json({ error }, { status })
```

### Favorites Flow (Client)

```
fetch('/api/settings/llm-providers') → data
  │
  ├─ Object.values(data.favoriteModels || {})  → [['gpt-4o'], ['claude', 'gpt-4o']]
  ├─ .flat()                                    → ['gpt-4o', 'claude', 'gpt-4o']
  ├─ [...new Set(...)]                          → ['gpt-4o', 'claude']
  └─ setFavoriteModels(combined)
       │
       └─ <ChatInput favoriteModels={combined} />
```

## File Changes

| File                                 | Action | Description                                                                                                |
| ------------------------------------ | ------ | ---------------------------------------------------------------------------------------------------------- |
| `src/app/api/agenthub/chat/route.js` | Modify | Add `callWithRetry()` helper (before `POST` fn), wrap `openai.chat.completions.create()` call at line ~237 |
| `src/views/AgentHub.jsx`             | Modify | Replace single-provider favorites read (line ~179) with combined + deduped logic                           |

## Interfaces / Contracts

### `callWithRetry(fn, options?)`

```js
/**
 * @param {() => Promise<any>} fn - Async function to retry (typically openai.chat.completions.create)
 * @param {object} [options]
 * @param {number} [options.maxRetries=3] - Total attempts (1 initial + retries)
 * @param {number} [options.baseDelayMs=1000] - Base delay for exponential backoff
 * @param {number} [options.maxDelayMs=30000] - Cap on computed delay
 * @param {number} [options.jitterMs=200] - ±jitter range
 * @returns {Promise<any>} - Resolved response from fn
 * @throws {Error} - Last error if all retries exhausted, or non-retryable error immediately
 */
async function callWithRetry(fn, options = {})
```

### `isRetryableError(error)`

```js
/**
 * @param {Error & {status?: number, code?: string}} error
 * @returns {boolean}
 */
function isRetryableError(error)
```

Retryable status codes: `429`, `500`, `503`
Retryable message patterns (case-insensitive): `"overloaded"`, `"rate_limit"`, `"too_many_requests"`, `"rate limited"`, `"econnreset"`, `"econnrefused"`, `"etimedout"`, `"socket hang up"`

### `parseRetryAfter(error)`

```js
/**
 * @param {Error & {headers?: Record<string,string>}} error
 * @returns {number|null} - Delay in ms, or null if no Retry-After header
 */
function parseRetryAfter(error)
```

## Testing Strategy

| Layer  | What to Test                                                               | Approach                                      |
| ------ | -------------------------------------------------------------------------- | --------------------------------------------- |
| Unit   | `isRetryableError()` with all status codes and message patterns            | Inline `console.assert` or minimal test block |
| Unit   | `parseRetryAfter()` with ms, seconds, HTTP-date, missing                   | Inline assertions                             |
| Unit   | `callWithRetry()` success on first attempt, retry on 429, propagate on 401 | Mock `openai.chat.completions.create`         |
| Manual | Trigger 429 in chat, observe retries in console                            | DevTools Network tab                          |
| Manual | Verify favorites dropdown shows models from all providers                  | UI inspection                                 |

## Migration / Rollout

No migration required. Both changes are additive and backward-compatible:

- Retry logic only adds resilience; existing error behavior is preserved when retries exhaust.
- Combined favorites only expands the list; no data is removed or modified in config.

## Open Questions

- [ ] Should retry attempts be logged to the client (e.g., "Reintentando 2/3…") or remain server-side silent?
- [ ] Should `callWithRetry` be extracted to a shared `lib/retry.js` for future reuse, or kept local to the route for now?
