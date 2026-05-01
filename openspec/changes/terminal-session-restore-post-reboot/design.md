# Design: Terminal Session Restore Post Reboot

## Technical Approach

Focus MVP on durable agent-session resume, not terminal resurrection. Normalize resumable sessions behind one provider adapter contract, harden `/api/opencode/sessions` with bounded execution, and make `TerminalWorkspacesManager` own one resumable-session catalog consumed by both topbar Reopen and Agent Room History. Hermes runtime detection stays separate from durable resume until CLI list+resume support is verified.

## Architecture Decisions

| Decision | Options | Choice | Rationale |
|---|---|---|---|
| Session domain model | Keep OpenCode-specific shapes in each UI; add shared resumable model | Shared `ResumableSession` adapter contract | Removes current split behavior and gives Hermes/Codex/Cloud clean future entry points. |
| OpenCode listing control | Unbounded `execFile`; UI-only timeout; backend timeout + UI cancellation | Backend timeout + UI cancellation | Fixes hanging Reopen at source and prevents stale refresh races in renderer. |
| History source | Keep `useAgentRegistryPolling` synthesizing OpenCode-only history; topbar separate fetch | Lift resumable catalog to `TerminalWorkspacesManager`, pass history down | One source of truth for durable resume while preserving existing active-agent polling. |
| Hermes MVP | Reopen by cwd relaunch; hide entirely; conditional adapter | Conditional adapter, excluded from durable catalog until verified | Current `hermes` relaunch is NOT resume. Keep runtime presence, not fake durability. |

## Data Flow

Sequence:

```text
User opens Reopen / History
  -> TerminalWorkspacesManager requests resumable catalog
  -> provider adapter calls /api/opencode/sessions?cwd=...
  -> route runs `opencode session list --format json --max-count 20` with 10s timeout
  -> adapter normalizes, filters, dedupes, caps results
  -> catalog state = success | empty | error
  -> Topbar Reopen and Agent Room History render same sessions
  -> Resume action launches `opencode --session <id>` in one new panel
```

`ResumableSession` contract:

```js
{
  provider: 'opencode' | 'hermes' | 'future',
  sessionId: string,
  title: string,
  cwd: string | null,
  updatedAt: string | null,
  isActive: boolean,
  activePanelId: string | null,
  resumeCommand: string,
  durable: boolean,
}
```

Rules:
- Backend caps provider fetch at 20 items; UI renders max 10 per provider.
- Dedupe key = `${provider}:${sessionId}`.
- CWD filter stays backend-first, prefix-match compatible with current route.
- Every refresh is abortable; stale responses are ignored.
- States are explicit: `loading`, `success`, `empty`, `error`.

## File Changes

| File | Action | Description |
|---|---|---|
| `src/app/api/opencode/sessions/route.js` | Modify | Add `execFile` timeout, normalized envelope, deterministic timeout/error metadata, newest-first dedupe/filter/cap behavior. |
| `src/lib/agentSessions/resumableSessionAdapters.js` | Create | Define adapter contract, OpenCode normalizer, provider capability flags, future Hermes/Codex/Cloud extension points. |
| `src/hooks/useResumableSessionCatalog.js` | Create | Fetch, abort, retry, and expose shared resumable catalog state for UI consumers. |
| `src/components/TerminalWorkspacesManager.jsx` | Modify | Replace split OpenCode/Hermes local state with shared catalog; render timeout/error/empty states; keep resume launching through `reopenOpenCodeSession()`. |
| `src/components/AgentRoomSidebar.jsx` | Modify | Consume resumable history as props instead of synthesizing OpenCode-only history internally. |
| `src/hooks/useAgentRegistryPolling.js` | Modify | Stop owning durable history synthesis; stay focused on active/live agent state. |

## Interfaces / Contracts

- `GET /api/opencode/sessions?cwd=...` -> `{ provider: 'opencode', status: 'success'|'empty'|'error', sessions: ResumableSession[], error?: { code, message, retryable } }`
- Adapter interface:
  - `id`
  - `supportsDurableResume(): boolean`
  - `listSessions(context): Promise<{status,sessions,error?}>`
  - `buildResumeCommand(session): string`

Hermes adapter MAY exist for runtime detection, but MUST return `supportsDurableResume() === false` until CLI list/resume is verified.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | OpenCode adapter normalization, dedupe, caps, unsupported-provider gating | Jest/Testing Library RED tests for adapter helpers first. |
| Integration | `/api/opencode/sessions` success, timeout, malformed JSON, empty list | Route tests with mocked `execFile`; assert 10s failure contract and envelope shape. |
| UI | Reopen loading/error/empty/success, retry, stale-refresh cancellation, History parity | Component tests for `TerminalWorkspacesManager` + `AgentRoomSidebar` using shared catalog mocks. |
| E2E | Resume same OpenCode session from topbar and Agent Room | Playwright flow proving one panel launches with `opencode --session <id>`. |

Strict TDD: RED route tests -> RED adapter tests -> RED component parity tests -> implementation.

## Migration / Rollout

No data migration required. Migrate behavior in three steps: (1) introduce adapter + catalog behind current OpenCode path, (2) switch topbar and Agent Room History to shared catalog, (3) remove `hermesSessions` durable reopen UI from MVP. Hermes/Codex/Cloud remain adapter slots, not shipped durable providers.

## Open Questions

- [ ] None blocking MVP; Hermes durable resume remains explicitly deferred pending verified CLI support.
