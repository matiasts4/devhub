# Apply Progress: zed-chat-assistant-ux-fixes

> **Mode**: Strict TDD. **Branch**: `feature/session-workspace-restore`. **Strategy**: Single PR, work-unit commits.
> **Executor**: SDD apply phase. Started 2026-06-02.

## Goal

Apply every task in `tasks.md` in strict TDD order, slice by slice. Land 6 work-unit commits. Run the §7 final acceptance gate.

---

## TDD Cycle Evidence

| Task | Test file                                                                    | Phase      | RED (test fails for the right reason) | GREEN (impl passes) | REFACTOR  |
| ---- | ---------------------------------------------------------------------------- | ---------- | ------------------------------------- | ------------------- | --------- |
| 1.1  | `src/components/asistente/__tests__/zedOpenTerminalFocus.test.js`            | Foundation | _pending_                             | _pending_           | _pending_ |
| 1.3  | `src/components/__tests__/zedOpenUrlEvent.test.js`                           | Foundation | _pending_                             | _pending_           | _pending_ |
| 1.5  | `src/components/__tests__/zedOpenUrlEvent.test.js` (extend)                  | Foundation | _pending_                             | _pending_           | _pending_ |
| 1.7  | `src/components/__tests__/zedOpenTerminalEvent.test.js` (extend)             | Foundation | _pending_                             | _pending_           | _pending_ |
| 2.1  | `src/components/asistente/__tests__/ChatPanel.test.jsx` (extend re-fire)     | Slice 1    | _pending_                             | _pending_           | _pending_ |
| 3.1  | `src/components/asistente/__tests__/buildZedHistory.test.js` (extend)        | Slice 2    | _pending_                             | _pending_           | _pending_ |
| 3.3  | `src/lib/asistente/__tests__/zedSystemPrompt.test.js` (extend)               | Slice 2    | _pending_                             | _pending_           | _pending_ |
| 3.5  | `src/components/asistente/__tests__/ChatPanel.test.jsx` (extend 2-turn body) | Slice 2    | _pending_                             | _pending_           | _pending_ |
| 4.1  | `src/lib/asistente/__tests__/tools/browser.test.js` (extend)                 | Slice 3    | _pending_                             | _pending_           | _pending_ |
| 4.3  | `src/components/workspace/__tests__/WorkspaceBrowserPane.openUrl.test.jsx`   | Slice 3    | _pending_                             | _pending_           | _pending_ |
| 5.1  | `tests/e2e/06_zed_open_terminal.spec.ts` (extend)                            | Slice 4    | _pending_                             | _pending_           | _pending_ |
| 5.2  | `tests/e2e/07_zed_open_url.spec.ts` (new)                                    | Slice 4    | _pending_                             | _pending_           | _pending_ |
| 5.3  | `tests/spec/zed-event-bus-namespace.test.mjs` (new)                          | Slice 4    | _pending_                             | _pending_           | _pending_ |

---

## §1 Foundation (Commit 1)

Status: _pending_

### Files created / modified

- `src/components/asistente/zedOpenTerminalFocus.js` (new)
- `src/components/asistente/__tests__/zedOpenTerminalFocus.test.js` (new)
- `src/components/zedOpenUrlEvent.js` (new)
- `src/components/__tests__/zedOpenUrlEvent.test.js` (new)
- `src/components/zedOpenTerminalEvent.js` (extend: add `dispatchZedOpenTerminal`)
- `src/components/__tests__/zedOpenTerminalEvent.test.js` (extend)

### Notes

- _pending_

---

## §2 Slice 1 — Visibility + re-fire (Commit 2)

Status: _pending_

### Files modified

- `src/components/asistente/ChatPanel.jsx` (+5 lines: `dispatchedSessionIdsRef`, use helper, plumb `focus`)
- `src/components/TerminalWorkspacesManager.jsx` (+12 lines: invoke `applyZedOpenTerminalFocus`)
- `src/components/asistente/__tests__/ChatPanel.test.jsx` (extend: re-fire test)

### Notes

- _pending_

---

## §3 Slice 2 — Memory + system-prompt (Commit 3)

Status: _pending_

### Files modified

- `src/components/asistente/ChatPanel.jsx` (1 line: drop `.slice(0, -1)`)
- `docs/prompts/asistente/zed-system-prompt.md` (append "Prior-turn context" section)
- `src/components/asistente/__tests__/buildZedHistory.test.js` (extend)
- `src/lib/asistente/__tests__/zedSystemPrompt.test.js` (extend)
- `src/components/asistente/__tests__/ChatPanel.test.jsx` (extend 2-turn memory body test)

### Notes

- _pending_

---

## §4 Slice 3 — `open_url` parity (Commit 4)

Status: _pending_

### Files modified

- `src/lib/asistente/tools/browser.js` (+3 lines: import + dispatch call)
- `src/components/workspace/WorkspaceBrowserPane.jsx` (~30 lines: new useEffect listener)
- `src/lib/asistente/__tests__/tools/browser.test.js` (extend)
- `src/components/workspace/__tests__/WorkspaceBrowserPane.openUrl.test.jsx` (new)

### Notes

- _pending_

---

## §5 Slice 4 — E2E with stubs (Commit 5)

Status: _pending_

### Files modified

- `tests/e2e/06_zed_open_terminal.spec.ts` (extend visibility + re-fire assertions)
- `tests/e2e/07_zed_open_url.spec.ts` (new)
- `tests/spec/zed-event-bus-namespace.test.mjs` (new CI scan)

### Notes

- _pending_

---

## §6 Cross-cutting (Commit 6)

Status: _pending_

### Files created

- `openspec/changes/zed-chat-assistant-ux-fixes/ROLLOUT.md` (archive-phase pointer + manual smoke checklist)

### Notes

- _pending_

---

## Open questions resolved

- _pending_

## Deviations from design

- _pending_

## Final acceptance gate

| Command                                                        | Status    |
| -------------------------------------------------------------- | --------- |
| `pnpm exec jest --runInBand`                                   | _pending_ |
| `pnpm exec jest --config jest.config.component.js --runInBand` | _pending_ |
| `pnpm exec playwright test`                                    | _pending_ |
| `pnpm run lint`                                                | _pending_ |

## Commits landed

_All 6 commits will be listed here as they land._
