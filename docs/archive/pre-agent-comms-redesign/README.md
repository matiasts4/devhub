# Archived — pre-`agent-comms-redesign` documentation

These documents describe the pre-`agent-comms-redesign` architecture
(HTTP+HMAC `_devhub_tell_director` + `pending_deliveries` polling,
deprecated in T-006..T-012 of the `agent-comms-redesign` change).

**Date range:** 2026-05-29 to 2026-05-30

**Why archived, not deleted:** Historical record. Useful when investigating
incidents that pre-date the bus redesign, or when comparing approaches.

**Current architecture (post-2026-06-01):** See `src/lib/bus/` for the bus
implementation, `openspec/changes/agent-comms-redesign/` for the design
rationale, and the test suites under `src/lib/__tests__/bus/` and
`tests/agenthub/e2e/comms-bus.test.js` for the executable contract.

## Contents

- `README.md` — old swarm debugging doc (described HMAC/tell_director flow)
- `SWARM_COMMUNICATION_HANDOFF_2026-05-30.md` — pre-bus comms handoff
- `DIAGNOSTIC_2026-05-30.md` — pre-bus diagnosis of broken comms
- `SOLUTION_DESIGN_2026-05-29.md` — pre-bus solution design
- `BUG_ANALYSIS_2026-05-29.md` — pre-bus bug analysis (Section 1 motivated the redesign)
