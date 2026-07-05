# Proposal: terminal-window-mount-parity

## Intent

Make workspace **window** switches (V1/V2/V3) use the same terminal mount/visibility contract as **workspace tab** switches: all `TerminalTTY` instances for the active workspace stay mounted; only opacity and `isVisibleInLayout` change. Apply the same rule for **pizarra** view switches (camera/selection), without remounting PTY surfaces.

Supersedes the unimplemented render-layer goal of `terminal-window-switching-stability` ("Unmounting inactive windows" was out of scope but the UI still unmounted parked windows).

## Scope

### In Scope

- Mount panel slots for every window in `WorkspaceTerminalSurface.jsx` (parked = opacity 0, `isVisibleInLayout=false`).
- Align `useWorkspacePanelLifecycle` window-switch effect with workspace-switch (native sync + post-split only).
- Pizarra `finishViewSwitch`: drop `layout-settled` burst on view change; rely on shared mount + `onWorkspaceWindowSelect`.
- Tests and spec delta `terminal-workspace-window-mount`.

### Out of Scope

- New terminal engine; default-on v2 migration (follow-up).
- Browser/right-dock unrelated UX.

## Success Criteria

- [ ] Parked window DOM contains terminals with `data-visible=false`.
- [ ] Window switch latency perceived comparable to workspace tab switch (no survivor/burst on single panel).
- [ ] Pizarra V1↔V2 does not require layout-settled storm for dock PTY recovery.