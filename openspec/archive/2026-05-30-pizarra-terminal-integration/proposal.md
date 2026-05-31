# Proposal: Pizarra Terminal Integration

## Intent

Embed `TerminalTTY` instances inside a pizarra (infinite canvas) as draggable, resizable, zoomable elements. The canvas controls terminal positioning, sizing, and zoom level; terminals must update their xterm.js FitAddon dimensions accordingly. Native VTE renderer is excluded from canvas embedding (Linux-only, viewport-absolute coordinates, canvas-incompatible).

## Scope

### In Scope
- Canvas component with terminal drag, drop, and resize handles
- `CanvasTerminal` wrapper: positions `TerminalTTY` via CSS `position: absolute`, passes `hideTitleBar={true}`, manages canvas-relative coordinates
- Zoom propagation: canvas zoom change updates container CSS width/height (NOT `transform: scale()`)
- PTY resize handling: terminal receives resize events from PTY and applies them in canvas context
- Session lifecycle in canvas: create/close/reconnect terminals bound to canvas session context
- Coordinate translation: canvas logical coords ↔ viewport absolute coords
- Rollback plan

### Out of Scope
- Native VTE renderer in canvas (xterm.js only)
- Panning the canvas while terminal is active (zoom-only for now)
- Multi-terminal selection/grouping
- Terminal tabs inside canvas elements
- Saving/restoring canvas layout (separate SDD)

## Capabilities

### New Capabilities
- `canvas-terminal`: Canvas component that hosts draggable, zoomable `TerminalTTY` instances with proper coordinate translation and session binding.

### Modified Capabilities
- None (new capability only)

## Approach

**Architecture**: Canvas hosts `CanvasTerminal` elements. Each `CanvasTerminal` wraps `TerminalTTY` with `hideTitleBar={true}` inside a `position: absolute` div managed by canvas pan/zoom state.

**Key constraint**: FitAddon uses `getBoundingClientRect()` which returns physical pixel dimensions, NOT CSS-transformed visual pixels. Canvas zoom MUST update container CSS width/height to trigger correct cols/rows recalculation.

### Zoom Flow
1. Canvas zoom changes (e.g., from 1.0 to 2.0)
2. Canvas updates `containerCSSWidth = logicalWidth / zoom` and `containerCSSHeight = logicalHeight / zoom`
3. ResizeObserver on container detects pixel dimension change
4. `sendResize()` → `fitAndResize()` → `fitAddon.fit()` → sends `{ type: 'resize', cols, rows }` to PTY
5. PTY responds with content scaled to new dimensions

### Coordinate Translation
```
viewportX = canvasElement.getBoundingClientRect().left + panOffset.x + (canvasLogicalX * zoom)
viewportY = canvasElement.getBoundingClientRect().top + panOffset.y + (canvasLogicalY * zoom)
```

### Session Lifecycle
- Canvas maintains a map of `terminalId → sessionId`
- On canvas close: iterate terminals, close each session via WebSocket
- On canvas save: serialize terminal positions, sizes, zoom, session bindings
- On canvas restore: recreate terminals with restored dimensions (sessions may need reconnection)

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/components/Pizarra/` | New | Canvas component with terminal hosting |
| `src/components/TerminalTTY.jsx` | Modified | Ensure `hideTitleBar` works for canvas; no VTE mode |
| `src/lib/terminal/ttyServer.js` | Modified | Add canvas-session binding for coordinated close |
| `src/app/api/terminal/session/route.js` | Modified | Accept canvas context in session options |
| `src/lib/canvas/` | New | Coordinate translation utilities |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| FitAddon dimensions stale on rapid zoom | Medium | Debounce zoom updates; buffer resize events |
| Terminal session leak on canvas crash | Medium | Canvas `useEffect` cleanup closes all sessions |
| Coordinate translation off by 1px at zoom boundaries | Low | Test with fractional zoom (1.25x, 0.75x) |
| Performance with 10+ terminals | Medium | Lazy-mount terminals outside viewport |

## Rollback Plan

1. **Disable feature flag**: Canvas terminal feature behind `NEXT_PUBLIC_CANVAS_TERMINALS_ENABLED=false`
2. **Revert canvas changes**: Remove `src/components/Pizarra/` and `src/lib/canvas/`
3. **Revert ttyServer changes**: Remove canvas-session binding, session cleanup remains via existing WebSocket close handler
4. **No database migrations**: All session state is in-memory or localStorage; no schema changes
5. **Verification**: Existing `TerminalWorkspacesManager` terminals unaffected; `TerminalTTY` unchanged except `hideTitleBar` behavior

## Dependencies

- Framer Motion (existing dependency, used for panel drag)
- xterm.js + FitAddon (existing, TerminalTTY dependency)
- Tauri (runtime, not modified)
- `react-resizable-panels` or similar for resize handles (evaluate existing usage)

## Success Criteria

- [ ] Single terminal draggable on canvas at zoom 1.0, 2.0, 0.5
- [ ] Zoom change triggers correct PTY resize (cols/rows match visual size)
- [ ] Terminal session closes when canvas closes (no orphan WebSocket)
- [ ] Multiple terminals (5+) on same canvas without performance degradation
- [ ] Canvas save/restore preserves terminal positions and sizes
- [ ] `transform: scale()` NOT used anywhere in canvas terminal code
