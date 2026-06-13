# zed-terminal-tools (delta)

> FRs: Z01, Z02, Z03, Z05, Z10. ADDED (no baseline).

## ADDED Requirements

### ZTT-001 — Name → terminalId resolver
`resolveTerminalByName(name, processes)` MUST resolve `displayName` to `terminalId` via case-insensitive exact match, then Levenshtein ≤ 1 fallback. Ambiguity → `candidates` (never most-recent). Empty/non-string `name` → `not_found`.

#### Scenario: case-insensitive exact match
- GIVEN `{ terminalId: 'p2', displayName: 'Chase' }`
- WHEN `resolveTerminalByName('chase', processes)` runs
- THEN result is `{ ok: true, terminalId: 'p2', displayName: 'Chase' }`.

#### Scenario: Levenshtein ≤ 1 fallback
- GIVEN only `Chase` exists
- WHEN `resolveTerminalByName('chasee', processes)` runs
- THEN result is `{ ok: true, terminalId: 'p2' }`.

#### Scenario: ambiguous name
- GIVEN two `Chase` entries after rename
- WHEN `resolveTerminalByName('Chase', processes)` runs
- THEN result is `{ ok: false, code: 'ambiguous', candidates: [...] }`.

#### Scenario: not_found
- GIVEN no `Maverick`
- WHEN resolver runs
- THEN result is `{ ok: false, code: 'not_found' }`.

### ZTT-002 — `list_terminals` returns `displayName`
Each entry MUST include `displayName`. If the API omits the field, the tool MUST fall back to `nameFromId(terminalId)` so the model never sees `undefined`.

#### Scenario: stub fallback
- GIVEN the API returns `{ terminalId: 'p2' }` without `displayName`
- WHEN `list_terminals` is called
- THEN each entry has a non-empty `displayName` string.

### ZTT-003 — `open_terminal` accepts `name`
`open_terminal` MUST accept optional `name` and return `{ terminalId, displayName, workspace, cwd, hint }`. Omitted `name` mints the next id and resolves `displayName` from the pool. `name` and default-mint are `oneOf`.

#### Scenario: explicit name
- GIVEN `Chase` is unused
- WHEN `open_terminal({ name: 'Chase' })` runs
- THEN result is `{ terminalId: 'p7', displayName: 'Chase', ... }`.

### ZTT-004 — Three tools accept `name` OR `session_id`
`execute_in_terminal`, `review_terminal_output`, `close_terminal` MUST accept `name` as an alternative to `session_id` (mutually exclusive). `name` triggers `resolveTerminalByName` over the latest `list_terminals`. Setting both MUST throw a Spanish error before any HTTP call.

#### Scenario: name resolves to the right session
- GIVEN `Chase → p1`, `Nate → p2`
- WHEN `execute_in_terminal({ name: 'Chase', data: 'ls' })` runs
- THEN the PUT targets `p1` and `p2` is untouched.

#### Scenario: both set
- GIVEN `name: 'Chase'` and `session_id: 'p2'`
- WHEN the tool runs
- THEN result is `{ error: 'no podés pasar name y session_id a la vez' }` with no HTTP call.

### ZTT-005 — `summarize_terminal` digest
`summarize_terminal(terminalId|name)` MUST capture the last 8KB of output, strip ANSI locally (no `strip-ansi` dep), apply OpenCode footer heuristics (`Choose:`, `y/n`, `confirm`, `waiting`), and return `{ terminalId, displayName, program?, status, waitingFor?, suggestedActions?, tuiReady?, capturedAt }`. Cache 2s in-memory keyed by `terminalId` (invisible to model). `status` MUST be `'unknown'` when neither `program === 'opencode'` nor a footer keyword is detected.

#### Scenario: OpenCode footer detected
- GIVEN the tail contains `Choose: [3] three PRs  [5] five PRs`
- WHEN `summarize_terminal({ name: 'Chase' })` runs
- THEN `status === 'waiting_user_input'`, `waitingFor` describes the choice, no string field contains `\u001b[`.

#### Scenario: 2s cache hit
- GIVEN called for `p2` 1s ago
- WHEN called again for `p2`
- THEN cached digest is returned without re-capturing.

#### Scenario: non-OpenCode terminal
- GIVEN `program === 'bash'` and no OpenCode footer
- WHEN `summarize_terminal({ terminalId: 'p3' })` runs
- THEN `status === 'unknown'`.

#### Scenario: missing terminal
- GIVEN no `Maverick`
- WHEN `summarize_terminal({ name: 'Maverick' })` runs
- THEN result is `{ error: 'not_found' }` (Spanish message in `zed-chat-ux` ZCX-001).
