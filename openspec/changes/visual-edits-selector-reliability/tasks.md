# Tasks: Visual Edits Selector Reliability

## Phase 1: RED — Support State And Activation

- [x] 1.1 RED: Extend `src/components/workspace/__tests__/WorkspaceBridgePane.test.jsx` for explicit support classification: same-origin DOM, proxied localhost, remote protocol, and immediate unsupported remote.
- [x] 1.2 RED: Add selector-semantics cases in `src/components/workspace/__tests__/WorkspaceBridgePane.test.jsx` proving supported clicks become selection input and unsupported requests never masquerade as active inspect mode.
- [x] 1.3 RED: Add `forceEditMode` entry coverage in `src/components/workspace/__tests__/WorkspaceBridgePane.test.jsx` for bridge auto-start through the same classifier path.

## Phase 2: RED — Proxy Reliability And Diagnostics

- [x] 2.1 RED: Extend `src/app/api/preview-proxy/route.test.js` for stable proxy marker/base retention across localhost rewrites and forwarded-host navigation URLs.
- [x] 2.2 RED: Add proxy escape and rewrite-failure diagnostics coverage in `src/app/api/preview-proxy/route.test.js`, including deterministic logging payloads when navigation cannot stay proxied.
- [x] 2.3 RED: Add component regression in `src/components/workspace/__tests__/WorkspaceBridgePane.test.jsx` for proxy escape clearing selection, detaching inspector, and showing unsupported copy immediately.

## Phase 3: GREEN — Explicit Support Model

- [x] 3.1 GREEN: Update `src/components/workspace/WorkspaceBrowserPane.jsx` to introduce explicit `supportMode` / `supportReason` / `selectorState` modeling and central support classification before activation.
- [x] 3.2 GREEN: Update `src/components/workspace/WorkspaceBrowserPane.jsx` so unsupported reasons fail immediately, while handshake timeout applies only to proxy/protocol-capable paths.
- [x] 3.3 GREEN: Update `src/components/workspace/WorkspaceBrowserPane.jsx` load/navigation handling to re-evaluate support, clear timers/listeners/selection on downgrade, and preserve supported remote/proxy re-arming.
- [x] 3.4 GREEN: Honor real `forceEditMode` semantics in `src/components/workspace/WorkspaceBrowserPane.jsx` and keep `src/components/workspace/WorkspaceBridgePane.jsx` on the explicit selector contract.
- [x] 3.5 GREEN: Update `src/components/workspace/WorkspaceRightDock.jsx` only as needed so dock/browser integration consumes the same browser-pane support contract without parallel heuristics.

## Phase 4: GREEN — Proxy Observability

- [x] 4.1 GREEN: Update `src/app/api/preview-proxy/route.js` to preserve proxy identity markers across HTML rewrites, keep localhost navigation inside proxy scope, and surface escape-safe diagnostics.
- [x] 4.2 GREEN: Add structured visual-edit transition logging in `src/components/workspace/WorkspaceBrowserPane.jsx` covering `from`, `to`, `supportMode`, `reason`, `browserUrl`, and `iframeSrc`.

## Phase 5: Verification

- [x] 5.1 REFACTOR: Trim duplicated selector/proxy test setup in `src/components/workspace/__tests__/WorkspaceBridgePane.test.jsx` and `src/app/api/preview-proxy/route.test.js` while keeping behavior assertions intact.
- [x] 5.2 VERIFY: Run `npm test -- WorkspaceBridgePane.test.jsx` and `npm test -- route.test.js`, then confirm every spec scenario and unsupported reason is covered by deterministic assertions/logging.
