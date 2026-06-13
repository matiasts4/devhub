# Tasks — terminal-lifecycle-hardening

> Detalle: `docs/errores/04-terminal-lifecycle-coverage-gaps/03-remediation-plan.md`

## Fase 0 — Documentación

- [x] 0.1 README + crash catalog + coverage matrix + remediation plan
- [x] 0.2 Baseline matrix rows 8–15
- [ ] 0.3 Ejecutar filas 8–15 y rellenar métricas (manual / `.deb`)

## Fase 1 — Swarm launch (P0)

- [x] 1.1 `terminalLifecycleSync.js` + tests
- [x] 1.2 Wire swarm burst via `syncPanelLifecycleLayout` in TWM
- [x] 1.3 `onMarkPanelsClosing` / `markPanelsClosing` on previous swarm panels
- [x] 1.4 Projection-ready defer (SharedTerminalSurface)
- [x] 1.5 `swarm-launch` / `panel-split` / `panel-relaunch` in TerminalTTY
- [x] 1.6 `swarmLaunchWorkspace.js` shared module
- [x] 1.7 Hook accepts `syncActiveWindowSnapshot` from parent (no no-op)

## Fase 2 — Split (P1)

- [x] 2.1 `panel-split` lifecycle sync after `handleSplit`
- [x] 2.2 Same for first-panel spawn
- [ ] 2.3 run-agent / planning-launch explicit burst (inherits split path)

## Fase 3 — Relaunch (P1)

- [x] 3.1 `panel-relaunch` sync in `applyPanelRelaunchCommand`
- [x] 3.2 TerminalTTY dedicated branch
- [ ] 3.3 Full relaunch vs projection race E2E

## Fase 4 — Policy central (P2)

- [x] 4.1 `LIFECYCLE_BURST_PHASES` presets
- [x] 4.2 TWM `syncPanelLifecycleLayout` + `markPanelsClosing` helpers
- [ ] 4.3 Singleton + swarm integration test (extended)
- [x] 4.4 Audit remaining raw `dispatchTerminalLayoutSettled` in TWM (panel-focus, workspace-remove)

## Fase 5 — Swarm orquestación

- [ ] 5.1 SwarmPromptEngine reactivation interpolation
- [ ] 5.2 ZED post-launch activation wiring
