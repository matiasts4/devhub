# Design: TERM-02 Renderer Switch Fallback

## Technical Approach

Keep TERM-02 as a preference-and-recovery layer, not a renderer-runtime project. `TerminalWorkspacesManager` will own requested renderer state through one dedicated localStorage helper scoped by project/workspace/panel. `TerminalTTY` will resolve that requested mode against a pure capability probe and derive one effective mode. In TERM-02, `xterm` is always ready; experimental modes exist only as gated selections, so unresolved selections deterministically run on `xterm` and expose a visible recovery banner without reconnect/remount loops.

## Architecture Decisions

| Decision | Options | Choice | Rationale |
|---|---|---|---|
| Preference storage | Extend `devhub_terminal_state`; separate renderer helper | Separate `terminalRendererPreferences` helper | Keeps renderer state small and evolvable like `rightDockState`, avoids bloating workspace layout schema, and makes rollback trivial. |
| Preference model | Workspace-only; panel-only; workspace default + panel override | Workspace default + panel override (`inherit`) | Satisfies per-workspace and per-panel goals with one stable model and predictable fallback order. |
| Readiness gate | Inline branches in `TerminalTTY`; pure capability/resolution helpers | Pure helpers (`getRendererCapability`, `resolveRendererSelection`) | TDD-friendly, avoids scattered renderer conditionals, and keeps future TERM-03/04 additions localized. |
| Recovery UX | Error overlay only; manager-only toast; inline fallback banner | Inline renderer recovery banner + manager selector | Fallback is not a transport failure. Users need a visible explanation and one-click return to `xterm` without hiding the live terminal. |

## Data Flow

```text
Toolbar selector change
  -> TerminalWorkspacesManager writes requested mode
  -> panel resolves requested mode: panel override -> workspace default -> xterm
  -> TerminalTTY calls resolveRendererSelection(requestedMode, capabilities)
  -> effectiveMode = xterm | experimental
  -> if fallback: mount/keep xterm, show recovery banner, allow reset-to-xterm
  -> terminal lifecycle effect depends on effectiveMode only
```

Sequence rules:
- Storage read is sanitized against live workspace/panel IDs.
- `xterm` capability is always `{ ready: true }`.
- Experimental modes return `{ ready: false, reason: 'not-ready' }` until TERM-03/04 ships.
- Requested-mode changes that still resolve to `xterm` MUST NOT recreate PTY/WebSocket/xterm.

## File Changes

| File | Action | Description |
|---|---|---|
| `src/components/terminal/terminalRendererPreferences.js` | Create | Storage key, sanitizer, read/write helpers, workspace-default + panel-override resolution helpers. |
| `src/components/terminal/terminalRendererCapabilities.js` | Create | Renderer catalog, readiness probe stub, deterministic fallback resolver, recovery copy helpers. |
| `src/components/TerminalWorkspacesManager.jsx` | Modify | Wire selector UI for active panel/workspace, pass requested mode + reset callback to `TerminalTTY`, sanitize prefs on hydrate/persist. |
| `src/components/TerminalTTY.jsx` | Modify | Resolve effective renderer, keep xterm lifecycle keyed to effective mode, render fallback/recovery banner, add pure exports for tests. |
| `src/components/__tests__/TerminalTTY.test.js` | Modify | Unit coverage for capability gate, effective renderer resolution, and banner visibility rules. |
| `src/components/__tests__/TerminalWorkspacesManager.panel-subtabs.test.jsx` | Modify | Behavioral tests for selector persistence and visible recovery/reset affordance. |
| `src/components/__tests__/TerminalWorkspacesManager.reopen.test.jsx` | Modify | Restore behavior uses persisted renderer prefs but still reopens on xterm after fallback. |

## Interfaces / Contracts

```js
export const TERMINAL_RENDERER_MODES = ['xterm', 'vte-experimental', 'ghostty-experimental'];

// storage shape
{
  version: 1,
  workspaces: {
    [workspaceId]: {
      defaultMode: 'xterm',
      panels: { [panelId]: 'inherit' | 'xterm' | 'vte-experimental' | 'ghostty-experimental' }
    }
  }
}

resolveRequestedRenderer({ workspaceId, panelId, prefs })
resolveRendererSelection({ requestedMode, capability })
// => { requestedMode, effectiveMode: 'xterm', didFallback, fallbackReason }
```

`TerminalTTY` props added:
- `requestedRendererMode`
- `onResetRendererToXterm`
- optional `rendererLabel`

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | Preference sanitization, inherit resolution, capability gate, deterministic fallback | Jest tests for pure helper modules and new `TerminalTTY` exports. |
| Integration | Selector writes requested mode; reload restores it; fallback banner shows while terminal stays usable | DOM tests in `TerminalWorkspacesManager.*.test.jsx` with mocked `TerminalTTY` or mocked storage. |
| Behavioral UI | Reset action forces stored/requested mode back to `xterm` and removes fallback banner | Testing Library/JSDOM behavior assertions, not implementation details. |
| E2E | None for TERM-02 | `npm test` only per project constraint. |

## Migration / Rollout

No migration required. Missing/corrupt renderer prefs sanitize to `xterm`. Unknown modes are dropped on read. Rollout is direct because TERM-02 never enables non-xterm runtime. Rollback deletes the helper/UI and ignores the renderer-pref key.

## Open Questions

- [ ] None blocking TERM-02; experimental capability values stay hard-coded false until TERM-03/04 provides real probes.
