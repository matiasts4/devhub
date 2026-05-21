# Tasks: SW-8.6A Director Briefing Preview MVP

## Phase 1: Foundation selector (smallest safe first batch)

- [x] 1.1 RED — `src/lib/operations/__tests__/swarmControl.test.js`: add failing tests for `selectDirectorBriefingPreview()` covering deterministic output, participant-order canonicalization, and empty/unavailable states from `mission_control` only.
- [x] 1.2 GREEN — `src/lib/operations/swarmControl.js`: implement/export pure `selectDirectorBriefingPreview(missionControl, recipientAgentIds)` using only `mission`, `participants`, `recent_messages`, `latest_message`, `pending_deliveries`, `presence`, `snapshot_at`, and `watermark`.
- [x] 1.3 REFACTOR — `src/lib/operations/swarmControl.js`, `src/lib/operations/__tests__/swarmControl.test.js`: dedupe tiny formatting/canonicalization helpers; keep out-of-scope fields excluded and output shape stable.

## Phase 2: Kernel preview UI

- [x] 2.1 RED — `src/views/__tests__/SwarmControl.test.jsx`: add failing coverage that the existing composer shows preview empty/ready/unavailable states and updates when recipient selection changes.
- [x] 2.2 GREEN — `src/components/control-room/MissionKernelPanel.jsx`: wire checkbox selection to `selectDirectorBriefingPreview()`, render bounded preview inside the existing composer seam, and keep current form ownership local.
- [x] 2.3 REFACTOR — `src/components/control-room/MissionKernelPanel.jsx`, `src/views/__tests__/SwarmControl.test.jsx`: tighten preview copy/DOM structure without adding a second composer or new controls.

## Phase 3: Submit-contract regression guard

- [x] 3.1 RED — `src/views/__tests__/SwarmControl.test.jsx`: add failing assertion that submit still posts only `{ action, recipient_agent_ids, body_summary }` while preview data never enters the payload.
- [x] 3.2 GREEN — `src/components/control-room/MissionKernelPanel.jsx`: preserve submit behavior unchanged after preview render; touch `src/views/SwarmControl.jsx` only if current seam proves insufficient.
- [x] 3.3 REFACTOR — touched files only: remove incidental duplication and keep preview state advisory/read-only.

## Phase 4: Focused verification + checkpoint

- [x] 4.1 VERIFY — run `npm test -- src/lib/operations/__tests__/swarmControl.test.js src/views/__tests__/SwarmControl.test.jsx`; confirm deterministic preview, safe degradation, selection updates, and unchanged submit contract.
- [ ] 4.2 CHECKPOINT — inspect `git status --short` and diff for scope lock to `src/lib/operations/swarmControl.js`, `src/lib/operations/__tests__/swarmControl.test.js`, `src/components/control-room/MissionKernelPanel.jsx`, `src/views/__tests__/SwarmControl.test.jsx`, plus `src/views/SwarmControl.jsx` only if required; create local checkpoint commit before follow-up work.

## Guardrails

- [x] Keep scope out of backend/schema/route work: no edits to `src/app/api/agenthub/operations/health/route.js`, persistence helpers, DevHub MCP flows, or durable payload shape.
- [x] Reject queue/approval/evidence/browser/GTK/SW-8.7A/SW-8.8A creep; preview stays derived, local, and read-only.
