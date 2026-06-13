## Phase A — Serializar lifecycle del terminal

- [x] A0.1–A0.3 — Telemetry + baseline doc
- [x] A1.1–A1.7 — Singleton portal wiring + preferred host + visibility resolver
- [ ] A1.8 — E2E/Jest toggle lifecycle (code done; manual 20-toggle + dispose-count on `.deb` = **human gate**)
- [x] A2.1 — resolveSharedTerminalVisibility + GPU release path tests
- [x] A2.2 — Portal-hidden → isVisibleInLayout=false
- [x] A2.3 — WebKitGTK policy documented
- [ ] A2.4 — 3-panel split `.deb` regression (**human gate**)
- [x] A3.1–A3.4 — IPC sync queue
- [ ] A3.5 — Manual resize during pizarra enter (**human gate**)
- [x] A4.1–A4.4 — Dispose guard
- [x] A5 (openspec) — Opacity-only transition
- [x] A6 → `terminal-tui-interaction` (T1/T5 landed on branch)

## Phase B — Rollout + shared state

- [x] B.1a — Rollout spec + `getRolloutStage()` + kill-switch tests
- [x] B.1b — `.env.staging.example` template (operational prod enable = human gate)
- [x] B.2a — `useWorkspaceSurfaceRegistry`
- [x] B.2b — `WorkspaceSurfaceRegistryProvider` + Pizarra bidirectional writes
- [x] B.2c — `RightDockSharedMirror` + `mergeRightDockChromeIntoSharedDock`

## Phase C — Motion polish

- [x] C.1–C.5 — Pre-existing
- [x] C fluidity pass — aligned fullscreen dock fade (220ms), symmetric exit, willChange opacity

## Deferred

- [ ] D — alacritty texture spike (only if A+B insufficient in manual QA)
