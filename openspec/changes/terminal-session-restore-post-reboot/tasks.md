# Tasks: Terminal Session Restore Post Reboot

## Phase 1: Infrastructure

- [x] 1.1 RED: Create `src/app/api/opencode/sessions/route.test.js` for success, timeout, malformed JSON, bounded results, cwd filtering, and `{ provider,status,sessions,error }` envelope cases.
- [x] 1.2 GREEN: Update `src/app/api/opencode/sessions/route.js` to add a 10s `execFile` timeout, parse/normalize/dedupe newest-first sessions, cap results, enrich `isActive/activePanelId`, and return deterministic `success|empty|error` responses.
- [x] 1.3 RED: Create `src/lib/agentSessions/resumableSessionAdapters.test.js` for `ResumableSession` normalization, provider capability gating, dedupe keys, and Hermes unsupported behavior.
- [x] 1.4 GREEN: Create `src/lib/agentSessions/resumableSessionAdapters.js` with the shared model, OpenCode adapter, `supportsDurableResume()` contract, and Hermes runtime-only/optional adapter scaffolding without fake durable resume.
- [x] 1.5 RED: Create `src/hooks/useResumableSessionCatalog.test.js` for abortable refresh, retry, stale-response ignore, and explicit `loading|success|empty|error` state transitions.
- [x] 1.6 GREEN: Create `src/hooks/useResumableSessionCatalog.js` to fetch provider catalogs, normalize results, merge durable sessions, and expose retry/refresh selectors for UI consumers.

## Phase 2: Implementation

- [x] 2.1 RED: Add component tests in `src/components/__tests__/TerminalWorkspacesManager.reopen.test.jsx` for topbar Reopen loading, error, empty, retry, and single-panel `opencode --session <id>` launch behavior.
- [x] 2.2 GREEN: Update `src/components/TerminalWorkspacesManager.jsx` to replace local OpenCode/Hermes reopen state with the shared resumable catalog and reboot-safe OpenCode resume UX.
- [x] 2.3 RED: Expand `src/components/__tests__/AgentRoomSidebar.test.js` and create `src/hooks/useAgentRegistryPolling.test.js` for shared history props, no stale history, and verified-provider-only rendering.
- [x] 2.4 GREEN: Update `src/components/AgentRoomSidebar.jsx` and `src/hooks/useAgentRegistryPolling.js` so History consumes shared resumable sessions while polling stays focused on active/live agent state.
- [x] 2.5 GREEN: Add deterministic reopen failure handling in `src/components/TerminalWorkspacesManager.jsx` and related helpers so invalidated sessions surface actionable errors instead of blank substitute tabs.

## Phase 3: Testing

- [x] 3.1 REFACTOR: Extract reusable fixtures/helpers for OpenCode session payloads and resumable-session view models across route, adapter, hook, and component tests.
- [x] 3.2 Add integration coverage proving topbar Reopen and Agent Room History render the same OpenCode resumable entries and recover from timeout/error retry flows.
- [ ] 3.3 Add `tests/e2e/terminal-session-restore-post-reboot.spec.ts` for restart/reboot-style OpenCode resume and explicit unsupported-Hermes behavior. Browser execution still waits on local Playwright Chromium, while split-layout + installed-app sidecar regressions are fixed in targeted tests.

## Non-MVP Follow-up

Codex/Cloud adapter extension points remain follow-up work only after OpenCode MVP ships and each provider's list/resume contract is verified.
