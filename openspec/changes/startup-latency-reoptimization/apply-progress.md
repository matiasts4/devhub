# Apply progress: startup-latency-reoptimization

## Landed (implementation pass)

- [x] `startupPerfMarks.js` + tests; wired in `App.js`, bootstrap, `useTerminalEngine`
- [x] `terminalWarmPolicy.js` + tests (Tier1–3, WebKitGTK Tier3 off, kill-switch)
- [x] `terminalStatePrefetch.js` + tests; consume-once in `useWorkspaceBootstrapEffect`
- [x] App idle warm: GET `/api/terminal/session`, prefetch `@xterm` modules, state prefetch, soft-mount
- [x] `heavySurfacesReady` starts `false` always — soft-mount cannot open xterm/WebGL until `/terminales` visible
- [x] Deps Wave B: `@xterm/xterm@5.5` + scoped addons (v6 deferred; canvas peer `^5`); CSS import updated
- [x] package.json: Next 16.2.10, React 19.2.7, Tauri API 2.11.1; remove deprecated `xterm*`
- [x] Focused tests: startup marks/warm/prefetch; TerminalTTY + webgl + v2; workspaceWindows

## Pending / follow-up

- [ ] Manual baseline marks (cold Terminales) with `localStorage.devhub_perf=1` → `window.__DEVHUB_PERF__.getSnapshot()`
- [ ] Deps Wave A full Radix/minors bump (optional after smoke)
- [ ] Deps Wave C Jest 27→30
- [ ] ANALYZE=true bundle snapshot note

## Kill-switch

`localStorage.devhub_terminal_warm=off`
