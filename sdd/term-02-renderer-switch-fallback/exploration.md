## Exploration: TERM-02 renderer switch + fallback

### Current State
- `TerminalTTY.jsx` owns the whole terminal runtime and is hard-wired to `xterm` + `xterm-addon-fit` + `xterm-addon-search`.
- `TerminalWorkspacesManager.jsx` already persists per-project workspace/panel layout in localStorage (`devhub_terminal_state[:projectId]`), including `workspaces`, `activeWsId`, `activePanelIds`, `workspaceWindows`, and `activeWindowIds`.
- There is no persisted renderer preference yet; renderer choice is implicit and always xterm.
- Existing hardening already makes xterm the stable baseline: resize/repaint recovery, diagnostics, reconnect, and explicit fallback docs.

### Affected Areas
- `src/components/TerminalTTY.jsx` — renderer selection, fallback gating, visible switch UI, and renderer-specific init path.
- `src/components/TerminalWorkspacesManager.jsx` — persistence boundary for per-panel/per-workspace terminal prefs.
- `src/components/workspace/rightDockState.js` — good reference for per-workspace persisted UI state shape.
- `src/components/workspace/browserWindowState.js` — good reference for per-project workspace-scoped state helpers.
- `src/components/__tests__/TerminalTTY.test.js` — pure helper tests for renderer selection/fallback behavior.
- `src/components/__tests__/TerminalWorkspacesManager.*.test.jsx` — persistence/restore coverage for workspace state.
- `tests/e2e/terminal-session-restore-post-reboot.spec.ts` — proves localStorage restore behavior pattern.
- `docs/25_Terminal_Renderer_Robusto_Roadmap.md` and `docs/26_TERM-01_Terminal_Renderer_Evidence_Pack.md` — define TERM-02 boundary and fallback contract.

### Approaches
1. **Small renderer preference layer in existing workspace state** — persist `rendererMode` per panel/workspace, keep xterm default, and let TerminalTTY choose xterm unless an experimental mode is both selected and truly ready.
   - Pros: smallest change, matches current persistence model, easy rollback to xterm, no TERM-03/04 dependency.
   - Cons: renderer concern leaks into workspace payload, needs careful normalization/migration.
   - Effort: Low/Medium

2. **Separate terminal renderer preferences store** — add a dedicated localStorage helper keyed by project/workspace/panel, independent from layout state.
   - Pros: cleaner ownership boundary, less risk of bloating workspace schema, simpler future migration.
   - Cons: more moving parts and extra lookup during render.
   - Effort: Medium

### Recommendation
Use **Approach 2** if TERM-02 is expected to evolve; otherwise use **Approach 1** only if the team wants the absolute smallest patch. For TERM-02 itself, I recommend a **tiny dedicated renderer-pref helper** patterned after `rightDockState.js`: store renderer mode per panel/workspace, default to `xterm`, and only mount an experimental renderer after a readiness probe passes. If probe fails or errors, immediately fall back to xterm and persist that fallback.

### Risks
- If renderer selection lives inside `TerminalTTY`, it can become volatile and get lost on remount/reconnect.
- If experimental mode is mounted before it is actually ready, users may see blank panels; fallback must happen before the panel is considered active.
- Need to avoid extra remount churn when switching renderers; keep the persisted mode in the workspace layer and pass a stable prop down.
- UI should not imply native renderer support exists yet; TERM-02 must only expose selection + fallback, not TERM-03/04 implementations.

### Ready for Proposal
Yes. Proposal/spec should cover: persisted renderer preference model, readiness/fallback contract, xterm escape hatch UI, and test matrix for per-panel/per-workspace restore.
