# Design: pizarra-shared-view-state

## 1. Technical Approach

This change collapses the two disjoint surface trees (workspace right-dock and pizarra canvas) into **a single set of shared surface singletons** that are mounted once and mirrored into whichever mode is currently active. The core abstraction is a `SharedSurfacesProvider` mounted at the workspace root that owns the lifecycle of every terminal and browser surface keyed by an explicit, stable `surfaceId`. Consumers attach to a surface by rendering `<SurfacePortal surfaceId="..." />`; the portal reaches into the provider's mounted child tree via React `createPortal` rather than letting the host React tree own the instance. Toggling `maximizedView: 'workspace' ↔ 'pizarra'` no longer unmounts the children — only the chrome (panels, dock, sidebars, headers) animates. XTerm scrollback, WebSocket session, and browser tab list survive every toggle untouched.

A second abstraction, the bidirectional `SharedSurfaceRegistry`, lets pizarra publish a `CanvasTerminal` it just dropped on the canvas and lets TWM offer it as a right-dock entry, and vice versa. The registry persists to `devhub_pizarra_surfaces_{projectId}_{workspaceId}` and merges disjoint writes with last-write-wins keyed by `surfaceId + updatedAt`. A single-writer contract (workspace writes, pizarra publishes intents via `requestSurfaceUpdate`) eliminates the race risk flagged in the proposal.

A `useModeTransition(maximizedView)` hook drives a 110 ms leaving + 220 ms entering cross-fade using framer-motion (already a project dependency, used by `WorkspaceSidebar`, `TerminalTabsManager`, `CommandBar`, and `PizarraElement`). GSAP is not added. The flicker on every drag/resize click is fixed by decoupling `suspendNativeSurface` from `mousedown` and gating it on the first real mousemove past a 3 px threshold.

A new `sharedDockState` slice is owned by TWM (the canonical writer) and consumed by pizarra via context. Browser tabs become first-class: each `surfaceId: 'browser'` carries an ordered `tabs: Tab[]` and a `tabsMode: 'single' | 'multi'` flag, defaulting to `'single'` for non-pizarra consumers so backward compatibility is preserved.

## 2. Architecture Decisions

| #   | Decision                                                                                                                                                       | Alternatives considered                                                                                                | Rationale                                                                                                                                                                                                                                                                                                                                                                             | Trade-offs                                                                                                                                                                                                        |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Portal-based singleton** (provider keeps a hidden mount of the real surface, host trees render `<SurfacePortal>` portals)                                    | Stable-mount (each mode owns its own instance, no portal) · Suspend-resume (freeze DOM in one tree, thaw in the other) | Preserves the React instance, XTerm, and WebSocket across mode toggles. The most surgical change to `TerminalTTY` — only a `surfaceId` prop + a `register/release` call. Works with React 19's portal model without new APIs.                                                                                                                                                         | Each host renders a portal target; the rendered DOM is the same element. The provider must manage a hidden mount somewhere at the root, which is a small fixed cost in layout.                                    |
| 2   | **Bidirectional `SharedSurfaceRegistry`** with surface record `{ id, type, panelId, x, y, width, height, ownerMode, lastTouchedAt }`                           | One-way TWM→registry (status quo) · Pub/sub event bus                                                                  | Existing `useLiveSurfaceRegistry` is one-way and lives in pizarra. Promoting it to bidirectional lets TWM subscribe to pizarra's surface drops and vice versa, which the spec requires. Last-write-wins merge on localStorage is acceptable because surfaces are owned by exactly one writer (workspace) at a time.                                                                   | Conflict resolution is a single-writer convention enforced in code (not a CRDT), so it relies on discipline. Acceptable for the surface metadata only — the heavy data (XTerm scrollback) is not in localStorage. |
| 3   | **TWM owns `sharedDockState`**; pizarra consumes via context                                                                                                   | pizarra owns the shared store · New third store                                                                        | TWM already owns `rightDockState` and the `maximizedView` toggle. Adding the surface list to the same store keeps a single source of truth for the visible chrome and avoids a second localStorage key. pizarra becomes a context consumer.                                                                                                                                           | TWM grows slightly larger; pizarra's dockState authorship goes away. Acceptable because pizarra is supposed to render pizarra-owned elements, not chrome.                                                         |
| 4   | **framer-motion** for the mode transition (NOT GSAP)                                                                                                           | GSAP · pure CSS keyframes                                                                                              | framer-motion is already a project dependency (`^12.38.0`) and already used by `WorkspaceSidebar`, `TerminalTabsManager`, `CommandBar`, `PizarraElement`. `useReducedMotion` ships with it, satisfying the spec's reduced-motion requirement for free. No new dep. `surfaceMotion.js` already exports `EASE_OUT` and `DUR` tokens; framer-motion reads them as numeric/bezier inputs. | framer-motion's `AnimatePresence` adds ~25 KB gzipped to bundles that already use it. Acceptable — the bundle is already paid for.                                                                                |
| 5   | **Flicker fix shape**: defer `suspendNativeSurface` until first real mousemove delta > 3 px                                                                    | Suspend on `mousedown` (status quo) · Suspend on any `mousemove` (no threshold) · Debounce the entire drag instead     | The 3 px threshold separates "I am about to drag" from "I am clicking to select". The native VTE panel is suspended only when movement actually starts, eliminating the IPC round-trip on selection clicks. Resize handles use the same pattern.                                                                                                                                      | Tiny threshold: a drag that moves < 3 px will not suspend, but that's a degenerate case (effectively a click). The fix only applies to native-VTE mode; XTerm-only mode is unaffected.                            |
| 6   | **Browser tab persistence**: TWM-owned array in `sharedDockState`; tabs survive mode switch because the tab list lives at TWM level, not in either mode's tree | Per-mode tab list (status quo) · Tabs in the SharedSurfacesProvider                                                    | The tab list is small metadata (URL, label, favicon, active flag). Putting it in `sharedDockState` next to the surface descriptor means it round-trips through localStorage and is naturally available to both modes. The actual `<webview>`/iframe is the surface; the tab list is the chrome.                                                                                       | Tab metadata and surface geometry share one localStorage entry. Quota risk is small (cap at 20 tabs per surface, LRU-evict closed > 7 days).                                                                      |
| 7   | **Strict TDD order**                                                                                                                                           | Implement-then-test · Test-after                                                                                       | Project convention. Tests for surface registration and `keepAlive` semantics first (lowest-level), then bidirectional registry, then tab strip, then mode transition, then flicker decoupling. Each layer tests the layer below.                                                                                                                                                      | Slower start. Fewer regressions later.                                                                                                                                                                            |
| 8   | **Feature flag `NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE`**                                                                                                       | Always-on with no flag · Per-WS rollout flag                                                                           | Project already uses `process.env.NEXT_PUBLIC_*` flags (`NEXT_PUBLIC_PIZARRA_GRID_TEXTURE`, `NEXT_PUBLIC_COMMANDBAR_ENABLED`). Same pattern. Flag default `false` in production builds (per proposal's "default false in production, true in dev").                                                                                                                                   | One more env var to track. Acceptable.                                                                                                                                                                            |
| 9   | **Migration is one-shot on first mount, writes `.bak` first**                                                                                                  | Big-bang migration script · Parallel-run old and new for N days                                                        | One-shot with backup is the safest pattern for localStorage. Old keys purged only after new state is verified on next read.                                                                                                                                                                                                                                                           | One extra localStorage write on first mount of a user with old data. Negligible.                                                                                                                                  |
| 10  | **Reuse `surfaceMotion.js` motion tokens**                                                                                                                     | New motion file · CSS variables only                                                                                   | Tokens `EASE_OUT`, `DUR.enter`, `DUR.base`, `SURFACE_ENTER_ANIMATION` already exist. The transition hook reads them — no hard-coded numbers in the hook. Keeps the design system consistent.                                                                                                                                                                                          | Tokens gain one new responsibility (mode transition) but the existing export surface is sufficient.                                                                                                               |

## 3. Data Flow Diagrams

### 3.1 TerminalTTY singleton lifecycle (portal)

```
                                  SharedSurfacesProvider (root, hidden)
                                          │
                       registerSurface({ id: "term-abc", type: "terminal" })
                                          │
                                          ▼
                              ┌───────────────────────────┐
                              │  terminalMounts (hidden)  │  ←─ TerminalTTY is mounted ONCE here
                              │  XTerm + WS + scrollback  │      on first register, kept alive
                              └──────────────┬────────────┘      until releaseSurface(id, false)
                                             │
                  ┌──────────────────────────┴──────────────────────────┐
                  │                                                     │
                  ▼                                                     ▼
       ┌─────────────────────┐                               ┌─────────────────────┐
       │ SurfacePortal host  │                               │ SurfacePortal host  │
       │  hostId="workspace- │                               │  hostId="pizarra-   │
       │  dock"              │                               │  canvas"            │
       │  (maximizedView =   │                               │  (maximizedView =   │
       │   "workspace")      │                               │   "pizarra")        │
       └─────────────────────┘                               └─────────────────────┘
                  │                                                     │
                  └─────────── createPortal children ──────────────────┘
                               (both see the SAME XTerm DOM)
```

Mode toggle = React rerender of the parents that own the portals, NOT of `terminalMounts`. The XTerm DOM node is never recreated.

### 3.2 Browser tab state flow

```
                addTab(url)            closeTab(id)         switchTab(id)
                   │                       │                     │
                   ▼                       ▼                     ▼
   ┌─────────────────────────────────────────────────────────────────────┐
   │  useSharedDockState (hook backed by TWM)                            │
   │  state.surfaces["browser-1"].tabs = [                               │
   │    { id, url, label, favicon, isActive, canClose }                  │
   │  ]                                                                   │
   └──────────────────────────────┬──────────────────────────────────────┘
                                  │ write
                                  ▼
                  devhub_shared_dock_state_{projectId}_{workspaceId}
                                  │
                                  │ storage event (cross-tab)
                                  ▼
                  Other tabs / reload → useSharedDockState → reconciles
```

Tabs are not separate React instances. The `<webview>`/iframe is the shared surface; switching `isActive` just changes which URL is bound to the shared `src` attribute via `SurfacePortal`'s `hostProps`. The active webview is NOT reloaded when switching — the URL change is applied in place. On mode toggle, the tab strip in the new mode reads the same array, no fetch, no re-render of the iframe.

### 3.3 Mode transition animation timing (framer-motion)

```
 Time   0ms  ────────────────────────────────────  330ms  ───  550ms
 Phase  │ idle               │ leaving │ flip  │ entering     │ idle
        │                    │         │       │              │
 layer  │ old chrome visible │ fades   │ swap  │ new chrome   │ settles
        │ new chrome hidden  │ +slides │       │ fades in     │
        │                    │ +scales │       │ +slides      │
        │                    │         │       │ +scales      │
 Term   │ XTerm + WS LIVE (visible in active host)                  │
 Browser│ webview/iframe LIVE (tab list cross-fades)               │
        ▲                                                          ▲
        │                                                          │
   useModeTransition(phase: "leaving", progress: 0 → 1)            │
   useModeTransition(phase: "entering", progress: 0 → 1)           │
```

The TERMINAL and BROWSER layers are NEVER in the workspace/pizarra React trees. They live in a stable `SurfacePortal` mounted at workspace root. The transition only animates the CHROME (panels, dock, sidebars). The terminals stay where they are; the chrome slides/fades around them.

Detailed timeline:

- **0 ms** — user clicks the mode toggle. `useModeTransition` enters `leaving`. Workspace chrome starts `opacity 1 → 0`, `translateY 0 → 16px`, `scale 1 → 0.96` over 110 ms.
- **100 ms** — pizarra chrome layer begins `opacity 0 → 1`, `translateY -16px → 0`, `scale 0.96 → 1` over 220 ms.
- **220 ms** — workspace chrome reaches `opacity 0`; framer-motion's `AnimatePresence` triggers exit. Old DOM is removed on the next tick.
- **330 ms** — pizarra chrome reaches full opacity / scale. `useModeTransition` returns to `idle`.
- **550 ms** — total elapsed (110 leaving + 220 entering + small margin for the AnimatePresence exit). Hook returns `{ phase: 'idle', progress: 0 }`.

Debounce: a new `maximizedView` change inside a 200 ms window cancels the in-flight transition and starts a new one with the new direction. Reduced-motion users get a single cross-fade under 50 ms.

## 4. File Changes

### 4.1 Modify

| File                                                  | Action          | Description                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/TerminalTTY.jsx`                      | Modify          | Accept `surfaceId` prop; call `registerSurface({ id: surfaceId, type: 'terminal' })` on mount, `releaseSurface(surfaceId, { keepAlive: true })` on React unmount unless `disposeOnUnmount` is set. Pass `surfaceId` to the WebSocket `sessionId` and to the native VTE `panelId` so all four references align. ~30 lines added. |
| `src/components/workspace/WorkspaceBrowserPane.jsx`   | Modify          | Accept `surfaceId` + `tabsMode` props. When `tabsMode === 'multi'`, render the tab strip + new-tab button on top. When `tabsMode === 'single'` (default), the existing single-tab chrome is used unchanged. ~60 lines added; existing behavior preserved by default.                                                            |
| `src/components/pizarra/CanvasTerminal.jsx`           | Modify          | Flicker fix: replace `setIsDragging(true)` on mousedown with `setPointerDown(true)`; on first mousemove past 3 px, set `suspendNativeSurface=true`; on mouseup, clear both. Same pattern for resize handles. Read `surfaceId` from the `shape.id` already passed; pass it to `TerminalTTY`. ~40 lines changed.                  |
| `src/components/pizarra/PizarraBrowserSurface.jsx`    | Modify          | Accept `surfaceId` prop; render a tab strip in the chrome. Apply the same flicker fix on the surface drag handler. Forward `surfaceId` to `WorkspaceBrowserPane`. ~50 lines added.                                                                                                                                              |
| `src/lib/pizarra/useLiveSurfaceRegistry.js`           | Modify          | Promote to `useSharedSurfaceRegistry` with bidirectional API: `register`, `unregister`, `subscribe(id, cb)`, `requestSurfaceUpdate(id, patch)`. Same localStorage key shape. ~80 lines changed, ~120 added.                                                                                                                     |
| `src/lib/pizarra/surfaceMotion.js`                    | Modify          | Add `useModeTransition` hook (framer-motion based, reads existing `DUR` and `EASE_OUT` tokens). Add `useBrowserTabs` related tokens (`DUR.tab = 140`, `TAB_BAR_HEIGHT = 32`). ~100 lines added. Existing tokens untouched.                                                                                                      |
| `src/lib/dock/twmStore.js` (NEW path)                 | Create + Modify | Create `src/lib/dock/twmStore.js` if absent. Promote the existing `rightDockState` reducer to consume `sharedDockState`. TWM's `useDockState` becomes a thin wrapper that reads/writes the shared slice. ~120 lines.                                                                                                            |
| `src/hooks/usePizarraState.js`                        | Modify          | Stop owning the panel list; delegate to `useSharedDockState`. Keep all other state-shape fields so pizarra freehand drawing is unchanged. ~30 lines changed.                                                                                                                                                                    |
| `src/components/control-room/rightDock/RightDock.jsx` | Modify          | Project surfaces from the shared store; add tab strip chrome when `tabsMode === 'multi'`. Reads `sharedDockState.surfaces` instead of the local TWM `panelList`. ~50 lines changed.                                                                                                                                             |
| `src/components/workspace/WorkspaceRightDock.jsx`     | Modify          | Wrap the existing dock content in `<SurfacePortal hostId="workspace-dock">` for terminal/browser surfaces that have a `surfaceId`. Falls back to inline mount when the flag is off. ~40 lines added.                                                                                                                            |
| `src/components/pizarra/PizarraPane.jsx`              | Modify          | Render a stable `<SurfacePortal hostId="pizarra-canvas">` for every surface in `sharedDockState`. Wrap the workspace↔pizarra flip in `useModeTransition`. ~60 lines changed.                                                                                                                                                    |
| `src/components/pizarra/PizarraCanvas.jsx`            | Modify          | Use `useModeTransition` for chrome layers (panels, dock, sidebars). The pizarra `CanvasTerminal` instances continue to register via `useSharedSurfaceRegistry` (now bidirectional). ~30 lines changed.                                                                                                                          |
| `openspec/specs/canvas-terminal/spec.md`              | Modify          | Drop "xterm-only" rule. Add Native VTE permitted + Flicker decoupling (covered by delta spec).                                                                                                                                                                                                                                  |
| `openspec/specs/board-browser-pane/spec.md`           | Modify          | Drop "no tab list" rule. Add `tabsMode: 'single' \| 'multi'` opt-in.                                                                                                                                                                                                                                                            |
| `openspec/specs/terminal-panel-state/spec.md`         | Modify          | Add TPS-5 (Shared Dock State), TPS-6 (Cross-Mode Sharing), TPS-7 (Backward Compat with TPS-1).                                                                                                                                                                                                                                  |

### 4.2 Create

| File                                                                 | Action | Description                                                                                                                                                                                                 | Approx LOC |
| -------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `src/components/workspace/SharedSurfacesProvider.jsx`                | Create | Root provider. Owns the hidden `terminalMounts` and `browserMounts` React subtrees. Exposes `SharedSurfacesContext`. Single source of truth for surface lifecycle.                                          | 180        |
| `src/components/workspace/SurfacePortal.jsx`                         | Create | React portal wrapper. Renders a div into the host that the provider portals the live surface into. Supports `hostId` to disambiguate multiple hosts.                                                        | 80         |
| `src/components/workspace/hooks/useSharedDockState.js`               | Create | Hook backed by TWM store + cross-tab `storage` event. Returns `{ surfaces, focusedSurfaceId, maximizedView, setSurfaceGeometry, addTab, closeTab, switchTab, reorderTabs, setTabsMode, setMaximizedView }`. | 220        |
| `src/components/workspace/hooks/useSharedSurfaceRegistry.js`         | Create | Wraps the promoted `useSharedSurfaceRegistry` from `lib/pizarra`. Bidirectional: `register`, `unregister`, `subscribe`, `requestSurfaceUpdate`.                                                             | 120        |
| `src/components/workspace/hooks/useBrowserTabs.js`                   | Create | Returns the per-surface tab list. Reads from `sharedDockState.surfaces[id].tabs` and dispatches add/close/switch/reorder.                                                                                   | 100        |
| `src/lib/pizarra/useModeTransition.js`                               | Create | framer-motion-based transition orchestrator. Returns `{ phase, progress, animProps, isAnimating }`. Respects `prefers-reduced-motion`.                                                                      | 130        |
| `src/lib/pizarra/featureFlag.js`                                     | Create | `isPizarraSharedViewEnabled()` reads `process.env.NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE`. Default `false` in production, `true` in dev.                                                                     | 30         |
| `src/lib/dock/sharedDockState.js`                                    | Create | Pure functions: `readSharedDockState`, `writeSharedDockState`, `migrateDockState`, `sanitizeSharedDockState`. One-shot migration of old `devhub_pizarra_state_*` + `devhub_right_dock_*` keys.              | 160        |
| `src/lib/dock/twmStore.js`                                           | Create | TWM's dock store. Holds `sharedDockState`. Exposes the same `useDockState` API that TWM components already call.                                                                                            | 200        |
| `src/components/workspace/BrowserTabStrip.jsx`                       | Create | Pure presentational component. Renders a row of tab chips + new-tab button. Used in workspace and pizarra chrome.                                                                                           | 130        |
| `src/components/workspace/__tests__/SharedSurfacesProvider.test.jsx` | Create | Unit tests: register, release with keepAlive, release with dispose, two portals to same surface.                                                                                                            | 180        |
| `src/components/workspace/__tests__/useSharedDockState.test.js`      | Create | Unit tests: tab ops, persistence, migration.                                                                                                                                                                | 160        |
| `src/components/workspace/__tests__/useModeTransition.test.js`       | Create | Unit tests: idle/leaving/entering phases, debounce, reduced-motion.                                                                                                                                         | 140        |
| `src/components/pizarra/__tests__/CanvasTerminal.flicker.test.jsx`   | Create | Regression: mousedown alone does not set `suspendNativeSurface`; first mousemove past 3 px does; mouseup clears.                                                                                            | 120        |
| `e2e/pizarra-shared-view.spec.ts`                                    | Create | Playwright: full mode toggle with active PTY session. Asserts scrollback preserved, no flash, tab list visible in both modes.                                                                               | 100        |

**Total modify**: 14 files (8 source, 3 spec, 3 component integration)
**Total create**: 15 files (10 source, 4 unit test, 1 E2E)
**Estimated LOC**: ~2 350 (impl) + ~700 (tests) ≈ **3 050 LOC** end-to-end. Tests-first portion is ~700 LOC before the corresponding impl.

## 5. Interfaces / Contracts

```typescript
// src/components/workspace/SharedSurfacesProvider.jsx

export type SurfaceKind = 'terminal' | 'browser';
export type OwnerMode = 'workspace' | 'pizarra' | 'shared';

export interface SurfaceRecord {
  id: string; // surfaceId — stable across modes
  type: SurfaceKind;
  panelId: string; // for terminal: same as id. for browser: tabId of the active tab
  x: number;
  y: number;
  width: number;
  height: number;
  ownerMode: OwnerMode;
  lastTouchedAt: number; // epoch ms; used for LRU + last-write-wins
}

export interface SharedSurfacesContext {
  // Lifecycle
  register(surface: SurfaceRecord): () => void; // returns unregister fn
  release(id: string, opts?: { keepAlive?: boolean }): void;

  // Query
  get(id: string): SurfaceRecord | undefined;
  list(): SurfaceRecord[];

  // Mutation (single-writer: workspace)
  setGeometry(id: string, geom: Partial<Pick<SurfaceRecord, 'x' | 'y' | 'width' | 'height'>>): void;
  setOwnerMode(id: string, mode: OwnerMode): void;
  remove(id: string): void;

  // Subscription
  subscribe(id: string, cb: (s: SurfaceRecord | undefined) => void): () => void;
}

// src/components/workspace/SurfacePortal.jsx

interface SurfacePortalProps {
  surfaceId: string;
  hostId: 'workspace-dock' | 'pizarra-canvas' | string;
  fallback?: React.ReactNode;
  hostProps?: Record<string, unknown>;
}

export function SurfacePortal(props: SurfacePortalProps): JSX.Element;

// src/components/workspace/hooks/useSharedDockState.js

export type Tab = {
  id: string; // tabId, stable for the life of the tab
  url: string;
  label: string;
  favicon?: string;
  isActive: boolean;
  canClose: boolean;
};

export type SurfaceDescriptor = SurfaceRecord & {
  title: string;
  nativePanelId?: string; // present for native-VTE terminal surfaces
  tabs?: Tab[]; // present for browser surfaces
  tabsMode: 'single' | 'multi';
};

export interface SharedDockState {
  surfaces: Record<string, SurfaceDescriptor>;
  focusedSurfaceId: string | null;
  maximizedView: 'browser' | 'editor' | 'swarm' | 'pizarra' | 'window';
}

export interface UseSharedDockStateApi {
  state: SharedDockState;
  // Surface ops
  upsertSurface(s: SurfaceDescriptor): void;
  setSurfaceGeometry(id: string, geom: Partial<Rect>): void;
  setOwnerMode(id: string, mode: OwnerMode): void;
  closeSurface(id: string): void;
  focusSurface(id: string): void;
  // Tab ops (per browser surface)
  addTab(surfaceId: string, url?: string): string; // returns tabId
  closeTab(surfaceId: string, tabId: string): void;
  switchTab(surfaceId: string, tabId: string): void;
  reorderTabs(surfaceId: string, tabIds: string[]): void;
  setTabsMode(surfaceId: string, mode: 'single' | 'multi'): void;
  // Mode
  setMaximizedView(v: SharedDockState['maximizedView']): void;
}

export function useSharedDockState(opts?: {
  projectId?: string;
  workspaceId?: string;
}): UseSharedDockStateApi;

// src/components/workspace/hooks/useBrowserTabs.js

export function useBrowserTabs(surfaceId: string): {
  tabs: Tab[];
  activeTabId: string | null;
  addTab: (url?: string) => string;
  closeTab: (id: string) => void;
  switchTab: (id: string) => void;
  reorderTabs: (ids: string[]) => void;
};

// src/lib/pizarra/useModeTransition.js

export type TransitionPhase = 'idle' | 'leaving' | 'entering';

export interface UseModeTransitionApi {
  phase: TransitionPhase;
  progress: number; // 0..1
  isAnimating: boolean;
  animProps: {
    initial: { opacity: number; y?: number; scale?: number };
    animate: { opacity: number; y?: number; scale?: number };
    transition: { duration: number; ease: string };
  };
}

export function useModeTransition(args: {
  maximizedView: 'workspace' | 'pizarra' | string;
  leaveMs?: number; // default DUR.base = 220 → spec says 110 leaving
  enterMs?: number; // default DUR.enter = 340 → spec says 220 entering
  debounceMs?: number; // default 200
}): UseModeTransitionApi;
```

### Flicker fix — `CanvasTerminal.jsx` change (non-obvious)

```typescript
// BEFORE (line 162-179 of src/components/pizarra/CanvasTerminal.jsx)
const handleHeaderMouseDown = usePizarraSurfaceDrag({
  surfaceId: resolvedShape.id,
  onDragStart: () => setIsDragging(true),
  onDragEnd: (args) => { setIsDragging(false); onDragEnd?.(args); },
});
// ...
<TerminalTTY suspendNativeSurface={isDragging} />     // ← flicker on click

// AFTER (proposed shape)
const [pointerDown, setPointerDown] = useState(false);
const [isLiveDragging, setIsLiveDragging] = useState(false);
const hasMovedRef = useRef(false);

const handleHeaderMouseDown = usePizarraSurfaceDrag({
  surfaceId: resolvedShape.id,
  onDragStart: () => { setPointerDown(true); hasMovedRef.current = false; },
  onDragMove: (e) => {
    if (pointerDown && !hasMovedRef.current
        && Math.hypot(e.movementX, e.movementY) > 3) {
      hasMovedRef.current = true;
      setIsLiveDragging(true);
    }
  },
  onDragEnd: (args) => {
    setPointerDown(false);
    setIsLiveDragging(false);
    onDragEnd?.(args);
  },
});
// ...
<TerminalTTY suspendNativeSurface={isLiveDragging} />
```

`usePizarraSurfaceDrag` is extended to call `onDragMove(moveEvent)` so the threshold check can read `movementX/movementY`. Resize handles get the identical treatment (track `pointerDown` + first real move). `setIsDragging` (the old boolean) is kept as a derived value `pointerDown || isLiveDragging` for visual state only — it does NOT drive `suspendNativeSurface`.

## 6. The Flicker Fix (deep dive)

The current `CanvasTerminal.jsx` calls `setIsDragging(true)` from `onDragStart` (i.e. mousedown) and the same `isDragging` is wired to `<TerminalTTY suspendNativeSurface={isDragging}>`. The native VTE panel is therefore hidden on EVERY mousedown — even pure selection clicks that never move. The IPC round-trip to hide and re-show the native VTE panel causes the visible flicker.

### 6.1 Threshold-gated suspension

Track two booleans instead of one:

- `pointerDown` — set true on mousedown of the header or any resize handle; cleared on mouseup. Used only for visual cursor / border state.
- `isLiveDragging` — set true on the FIRST `mousemove` after `pointerDown` where `Math.hypot(movementX, movementY) > 3`. Cleared on mouseup. Used to drive `suspendNativeSurface`.

The 3 px threshold is the smallest movement that reliably distinguishes a click from a drag at typical pointer precision. Any smaller threshold (1 px) catches jitter on stationary mice and still flickers; any larger (8 px) makes the native panel snap when a user starts a slow drag.

### 6.2 Reattach (when suspension ends)

The current `resolvedBounds` effect (lines 68-82) calls `resizeNativeVtePanel(...)` on geometry changes. Today this fires on the IPC loop asynchronously when `isDragging` is true. After the fix, when `isLiveDragging` flips back to `false`, the next `resolvedBounds` effect run calls `setNativeVtePanelVisibility({ panelId, visible: true })` **synchronously** in the same effect, instead of routing through the async IPC loop. This eliminates the one-frame gap between wrapper repaint and native panel repaint.

A `transform: translate3d(0,0,0)` snap is applied to the wrapper for 16 ms after the reattach so the chrome catches up before any new `will-change` style applies. This is the same pattern Konva uses internally to flush a layout.

### 6.3 Why not just always-suspend-on-any-mousemove?

A naive fix (no threshold) suspends the native panel for the entire duration of any cursor movement, including hover-driven moves outside the surface. That re-introduces the flicker when the user simply moves the cursor across the surface. The 3 px gate is the smallest viable fix.

## 7. The Mode Transition (deep dive)

The workspace↔pizarra toggle currently unmounts one React tree and mounts another, which is what makes every TerminalTTY dispose. The transition reverses that: the trees swap CHROME, not surfaces.

### 7.1 Layer model

```
┌──────────────────────────────────────────────────────────────┐
│ workspace root                                               │
│                                                              │
│  ┌─ SharedSurfacesProvider ─────────────────────────────────┐ │
│  │                                                          │ │
│  │  hidden mounts (always live, never unmount):             │ │
│  │   terminalMounts[id]  → <TerminalTTY>                    │ │
│  │   browserMounts[id]   → <WorkspaceBrowserPane>           │ │
│  │                                                          │ │
│  │  <SurfacePortal hostId="workspace-dock" /> ← chrome owns  │ │
│  │  <SurfacePortal hostId="pizarra-canvas"  /> ← chrome owns │ │
│  │                                                          │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                              │
│  workspace chrome (panimates w/ useModeTransition):           │
│   • WorkspaceRightDock                                       │
│   • WorkspaceSidebar                                         │
│   • EditorPaneStack                                          │
│                                                              │
│  pizarra chrome (panimates w/ useModeTransition):            │
│   • PizarraCanvas                                            │
│   • PizarraToolPalette                                       │
│   • PizarraMinimap                                           │
│   • SurfacePortal for each shared browser/terminal           │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

The chrome layers use `framer-motion`'s `AnimatePresence` keyed on `maximizedView`. When `maximizedView` flips, `AnimatePresence` runs the `exit` animation of the old chrome (the `leaving` phase, 110 ms) then mounts the new chrome with the `enter` animation (`entering` phase, 220 ms). The hidden `terminalMounts` and `browserMounts` never see this — they sit in the same React tree position the whole time.

### 7.2 Hook shape

```typescript
function useModeTransition({ maximizedView, leaveMs = 110, enterMs = 220, debounceMs = 200 }) {
  const [internal, setInternal] = useState(maximizedView);
  const [phase, setPhase] = useState<TransitionPhase>('idle');
  const [progress, setProgress] = useState(0);
  const reducedMotion = useReducedMotion();

  // Debounce + cancel-in-flight
  useEffect(() => {
    if (maximizedView === internal) return;
    const timer = setTimeout(() => {
      setInternal(maximizedView);
      setPhase('leaving');
      const t1 = setTimeout(() => setPhase('entering'), leaveMs);
      const t2 = setTimeout(() => {
        setPhase('idle');
        setProgress(0);
      }, leaveMs + enterMs);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [maximizedView, internal, leaveMs, enterMs, debounceMs]);

  // Animate progress 0..1 in each phase
  // (uses requestAnimationFrame, eased with EASE_OUT)
  // ...

  return {
    phase,
    progress,
    isAnimating: phase !== 'idle',
    animProps: reducedMotion
      ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.05 } }
      : {
          initial: { opacity: 0, y: 16, scale: 0.96 },
          animate: { opacity: 1, y: 0, scale: 1 },
          transition: { duration: enterMs / 1000, ease: [0.22, 1, 0.36, 1] },
        },
  };
}
```

The hook is the only thing that reads `maximizedView` from `sharedDockState` for animation purposes. Everything else reads it for behavior, not motion. Reduced-motion users get a 50 ms cross-fade with no slide/scale.

## 8. Testing Strategy

| Layer                                       | What to Test                                                                                                                                                                                      | Approach                                                                                                                                           |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit — `useSharedDockState`                 | add/close/switch/reorder tab ops; persist to localStorage; cross-tab `storage` event merge; migration of old `devhub_pizarra_state_*` + `devhub_right_dock_*` keys                                | Jest + a `Storage` mock that emits `storage` events on write. Assert state shape after each op, assert localStorage payload.                       |
| Unit — `useSharedSurfaceRegistry`           | register + subscribe + `requestSurfaceUpdate`; LWW merge on disjoint writes; `unregister` removes from map AND from localStorage                                                                  | Same harness. Mock `Date.now` for `lastTouchedAt`.                                                                                                 |
| Unit — `useModeTransition`                  | idle → leaving → entering → idle progression; progress 0..1 in each phase; debounce 200 ms cancels in-flight; reduced-motion returns 50 ms cross-fade only                                        | Jest fake timers; render the hook via `@testing-library/react`'s `renderHook`.                                                                     |
| Unit — `SurfacePortal`                      | mounts the live surface when registered; renders empty when surfaceId is missing; two portals share the same DOM                                                                                  | `render` with a provider wrapping two portals + assert both hosts contain the same DOM id.                                                         |
| Unit — `SharedSurfacesProvider`             | release with `keepAlive: true` keeps the surface alive while refcount > 0; release with `keepAlive: false` disposes                                                                               | `render` + assert XTerm mock was disposed the right number of times.                                                                               |
| Component — `CanvasTerminal` flicker        | mousedown alone does not flip `suspendNativeSurface`; first mousemove past 3 px does; mouseup clears; resize handles same                                                                         | `fireEvent.mouseDown` + `mouseMove` with `movementX/Y` set + `mouseUp`; assert the prop on the TerminalTTY mock.                                   |
| Component — `BrowserTabStrip`               | renders N chips; clicking switches active; close button removes tab; new-tab button adds a default tab                                                                                            | RTL `render` + `userEvent.click` per chip + assert state.                                                                                          |
| Component — `WorkspaceBrowserPane` tabsMode | `tabsMode='single'` keeps legacy single-tab UI; `tabsMode='multi'` renders strip                                                                                                                  | Two renders with the two prop values, snapshot the chrome.                                                                                         |
| Integration — mode toggle                   | `maximizedView: 'workspace' → 'pizarra'` does not unmount `TerminalTTY`; WebSocket count stays 1; XTerm DOM id is the same before and after                                                       | RTL `render` of a tree that contains a `SharedSurfacesProvider` + a wrapper that flips `maximizedView`; assert the TerminalTTY mock's mount count. |
| Integration — registry bidirectional        | drop a `CanvasTerminal` on the canvas, assert the surface shows up in the right-dock chrome within one frame; close from the right-dock, assert it disappears from the canvas                     | End-to-end mount of the provider + both chrome trees.                                                                                              |
| E2E (Playwright) — full mode toggle         | with a real PTY session running Claude Code, toggle workspace→pizarra→workspace, assert scrollback bytes unchanged, no WebSocket reconnection in the dev-tools log                                | `e2e/pizarra-shared-view.spec.ts`.                                                                                                                 |
| E2E (Playwright) — flicker regression       | drag the pizarra terminal header from rest, assert no flicker frames in a video diff (compare to baseline)                                                                                        | `playwright test --video=on`.                                                                                                                      |
| E2E (Playwright) — multi-tab browser        | open 3 tabs, toggle mode, assert active tab + URL unchanged; close one tab from pizarra, assert right-dock tab list updates                                                                       | Same spec file.                                                                                                                                    |
| Visual regression                           | screenshot at t=0, t=110 ms, t=220 ms, t=330 ms during a mode transition; assert ≤ 5 % pixel diff from the design tokens                                                                          | Playwright + a `transitionTokens.snapshot.json` baseline.                                                                                          |
| Migration                                   | on a localStorage containing legacy `devhub_pizarra_state_*` + `devhub_right_dock_*`, mount the provider, assert new `devhub_shared_dock_state_*` written and `.bak` key present; old keys purged | Integration test that primes localStorage before render.                                                                                           |

## 9. Migration / Rollout

### 9.1 Feature flag

`NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE`:

- `true` in dev (default), `false` in production builds (per the proposal's stated intent).
- Read once at module scope in `src/lib/pizarra/featureFlag.js`:
  ```js
  export const isPizarraSharedViewEnabled = () =>
    process.env.NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE === 'true';
  ```
- When `false`, the new code paths short-circuit to the legacy `usePizarraState` + per-tree TTY/browser mount. The provider and portal mount but render `fallback` (empty). No localStorage migration runs.
- When `true`, the new code paths take over; the old `usePizarraState.panelList` is migrated on first read (see 9.2).

### 9.2 Migration (one-shot, on first `true` mount with legacy data)

```js
// src/lib/dock/sharedDockState.js
function migrateDockState(storage, projectId, workspaceId) {
  const newKey = buildSharedDockStorageKey(projectId, workspaceId);
  if (storage.getItem(newKey)) return readSharedDockState(storage, newKey);

  const bakKey = `${newKey}.bak`;
  const pizarra = storage.getItem(`devhub_pizarra_state_${projectId}_${workspaceId}`);
  const right = storage.getItem(`devhub_right_dock_${projectId}_${workspaceId}`);
  if (!pizarra && !right) return DEFAULT_SHARED_DOCK_STATE;

  // Back up legacy keys before any write
  if (pizarra) storage.setItem(`devhub_pizarra_state_${projectId}_${workspaceId}.bak`, pizarra);
  if (right) storage.setItem(`devhub_right_dock_${projectId}_${workspaceId}.bak`, right);

  const merged = mergeDockState(pizarra, right);
  writeSharedDockState(storage, newKey, merged);

  // Purge legacy keys ONLY after a successful re-read
  if (readSharedDockState(storage, newKey)) {
    storage.removeItem(`devhub_pizarra_state_${projectId}_${workspaceId}`);
    storage.removeItem(`devhub_right_dock_${projectId}_${workspaceId}`);
  }
  return merged;
}
```

`.bak` files are kept for 30 days (a later cleanup pass can remove them; not part of this change).

### 9.3 Phased rollout

1. **Dev** — flag on. Dogfood for 5 working days. Verify no scrollback loss, no flicker, smooth transition.
2. **Staging** — flag on. Run Playwright suite + manual smoke. Verify localStorage migration on a few sample projects.
3. **Production** — flag off by default. Canary 1 % of workspaces for 48 h. Expand to 10 %, 50 %, 100 % with one-week gaps. Monitor for: scrollback loss, IPC errors, mode-toggle jank (Frame Timing API), localStorage quota warnings.
4. **Flag retirement** — after 30 days at 100 %, drop the flag and the legacy `usePizarraState.panelList` path. Delete the conditional code.

### 9.4 Rollback

At any point:

1. Set `NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE=false`. The provider short-circuits; old code paths re-engage.
2. No data loss: the new `devhub_shared_dock_state_*` key is untouched, and the `.bak` legacy keys are still on disk.
3. To re-enable, flip the flag back. No re-migration runs (the new key already exists).

The `pizarra-state-persistence` change (freehand drawing) is independent and uses a separate localStorage key. It is not touched by this migration and not gated by this flag.

## 10. Open Questions

- [ ] **Q1 — Should the tab list live in `sharedDockState` (single source) or in a separate `devhub_tabs_*` localStorage key (single responsibility)?** Recommendation: `sharedDockState` (single source). Tabs are small and the cap is 20/surface; quota risk is low. If quota becomes an issue, we can split later without changing the public API.
- [ ] **Q2 — For pizarra-mounted browser, do tabs share the pane's chromium process (status quo) or get a per-tab process?** Out-of-scope per the proposal; deferred.
- [ ] **Q3 — Should the cross-tab `storage` event trigger a soft reload of the surfaces, or just refresh chrome?** Recommendation: chrome refresh only. Reloading surfaces would disconnect live PTY sessions on other tabs, which is worse than the current behavior.
