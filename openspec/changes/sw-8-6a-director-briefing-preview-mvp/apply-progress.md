# Apply Progress — sw-8-6a-director-briefing-preview-mvp

**Change**: sw-8-6a-director-briefing-preview-mvp
**Artifact Sync**: 2026-05-20
**Synced From**: proposal.md, design.md, specs/director-briefing-preview/spec.md, tasks.md, and verified Engram records for apply-progress + verify
**Mode**: Strict TDD

## Verified Complete

- [x] 1.1 RED — Selector tests were added for deterministic output, participant-order canonicalization, and safe empty/unavailable states.
- [x] 1.2 GREEN — `selectDirectorBriefingPreview(missionControl, recipientAgentIds)` was implemented/exported as a pure helper over in-scope `mission_control` fields only.
- [x] 1.3 REFACTOR — Tiny selector/test helpers were deduped while keeping output shape stable and excluding out-of-scope fields.
- [x] 2.1 RED — View coverage was added for empty, ready, and unavailable preview states plus recipient-selection updates in the existing composer seam.
- [x] 2.2 GREEN — `MissionKernelPanel.jsx` was wired to the preview selector with local selection state and bounded preview UI, without changing submit contract.
- [x] 2.3 REFACTOR — Preview helpers/DOM structure were tightened in touched UI/test files only; no second composer introduced.
- [x] 3.1 RED — View coverage asserts submit still posts only `{ action, recipient_agent_ids, body_summary }` and excludes preview-only data.
- [x] 3.2 GREEN — Submit behavior stayed unchanged after preview render; preview state remained local/read-only.
- [x] 3.3 REFACTOR — Incidental duplication was removed while keeping preview advisory-only.
- [x] 4.1 VERIFY — Focused verification previously ran: `npm test -- src/lib/operations/__tests__/swarmControl.test.js src/views/__tests__/SwarmControl.test.jsx --runInBand` with both suites passing (40/40 total).
- [x] Guardrails — Verified no backend/schema/route edits and no queue/approval/evidence/browser/GTK/SW-8.7A/SW-8.8A creep for this slice.

## Remaining

- [ ] 4.2 CHECKPOINT — No verified evidence of the required local checkpoint commit in the gathered records, so this remains incomplete.

## Warnings

- Warning: `tasks.md` had been stale on disk relative to verified implementation state; this artifact-sync reconciles disk with previously gathered evidence only.
- Warning: `4.2 CHECKPOINT` stays open because creating/verifying a local checkpoint commit was not evidenced in the gathered records, and this sync did not perform git commit work.

## Notes

- This file records verified reality only. No `src/`, test, route, schema, or backend files were changed during artifact sync.
