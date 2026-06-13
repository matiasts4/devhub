# Phase B.1 — Staged rollout: `NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE`

> Spec artifact for `openspec/changes/terminal-pizarra-stability`. Implements the
> rollout plan for the shared-view singleton path (A.1). All new behavior stays
> behind `isPizarraSharedViewEnabled()` until each stage gate is green.

## Flag reference

| Env var | Values (truthy) | Values (falsy) |
|---|---|---|
| `NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE` | `1`, `true`, `yes`, `on` (case-insensitive) | `0`, `false`, `no`, `off`, unset (prod default) |

Diagnostics: `getFlagSource()` → `env-explicit` | `env-default-dev` | `env-default-prod`  
Stage helper: `getRolloutStage()` → `dev` | `staging` | `prod`

---

## Rollout stages

### Stage 1 — `dev` (local + CI)

| Property | Value |
|---|---|
| **When** | `NODE_ENV !== 'production'` |
| **Default** | Flag **ON** (`env-default-dev`) |
| **Override** | Set `NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE=0` to exercise kill switch locally |
| **Owner** | All agents; dogfood on every PR |

**Goal:** Shared-view code paths run by default so regressions surface in unit tests and local toggles before staging.

### Stage 2 — `staging` (pre-prod QA)

| Property | Value |
|---|---|
| **When** | `NODE_ENV === 'production'` **and** flag is **explicitly set** (`env-explicit`) |
| **Default** | No fallback — deploy **must** set the env var or shared-view stays OFF |
| **Override** | `NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE=1` (or truthy spelling) to enable; `=0` to verify kill switch |
| **Owner** | Coordination agent + QA |

**Goal:** Production build artifact with explicit opt-in. A missed env var in staging blocks silent rollout rather than accidentally enabling the singleton path.

### Stage 3 — `prod` (production)

| Property | Value |
|---|---|
| **When** | `NODE_ENV === 'production'` **and** flag unset (`env-default-prod`) |
| **Default** | Flag **OFF** — legacy unmount/remount path |
| **Enable** | Set `NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE=1` **only after** Agente 1 (terminales) sign-off and all gates below are green |
| **Owner** | Release / coordination |

**Goal:** Zero user impact until deliberate prod enable. Kill switch = unset or explicit `0` + redeploy/restart.

---

## Quality gates (must pass before advancing)

### Gate → Stage 2 (`dev` → `staging`)

| Check | Command / criterion | Pass |
|---|---|---|
| Unit suite | `npm test -- --testPathPattern="featureFlag|SharedTerminalSurface|SharedSurfacesProvider|nativeLayoutSync|useModeTransition|TerminalTTY.xterm-webgl"` | All green |
| Flag OFF contract | `SharedTerminalSurface.flagOff.test.js` — Registrar + Portal render null | Pass |
| A.0 headline metric (dev) | 20× workspace↔pizarra toggle, flag ON: `dispose`/toggle = **0** in `data/logs/terminal-debug.log` | Record in `baseline-metrics.md` row 1 or 7 |
| Manual smoke | Toggle with live terminal; scrollback preserved | No crash, no glyph explosion |

### Gate → Stage 3 (`staging` → `prod` enable)

| Check | Command / criterion | Pass |
|---|---|---|
| E2E shared-view | `npx playwright test tests/e2e/pizarra-shared-view-state.spec.ts` | Green |
| Kill switch on staging | Flag `=0`, redeploy → legacy path (see checklist below) | Verified |
| `.deb` manual protocol | Scenarios 2, 3, 6, 7 in `baseline-metrics.md` on WebKitGTK build | dispose/toggle = 0 (flag ON); no crash |
| A.0 metrics | Rows 2–3, 6–7 filled; dispose/toggle = 0 for mode toggles | Documented |
| Agente 1 sign-off | Terminal noise filter + IPC serialize (A.3) stable per `docs/delegation/00-shared-context.md` | Recorded |

---

## Kill switch verification checklist

Run with `NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE=0` (or unset in prod). **Process restart required** after env change (module-scope cache).

- [ ] `isPizarraSharedViewEnabled()` returns `false`
- [ ] `getRolloutStage()` reports expected stage (`dev` with explicit OFF, or `prod` with default OFF)
- [ ] `SharedTerminalSurfaceRegistrar` renders **null** — no `useSurfaceContent` registration
- [ ] `SharedTerminalSurfacePortal` renders **null** — no `SurfacePortal` host in DOM (`data-testid="surface-portal-host-*"` absent)
- [ ] Workspace panel mounts **direct** `TerminalTTY` (not deferred placeholder-only when pizarra owns)
- [ ] Pizarra `CanvasTerminal` mounts **direct** `TerminalTTY` (not portal)
- [ ] Mode toggle: **≥1 dispose + ≥1 boot** per toggle (legacy behavior) — confirms singleton path inactive
- [ ] No writes to shared-view `localStorage` migration keys (flag OFF = no migration)

Automated: `npm test -- --testPathPattern="SharedTerminalSurface.flagOff|featureFlag"`.

---

## Rollback procedure

1. **Immediate (prod incident):** Set `NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE=0` (or remove the var) in the deployment env.
2. **Redeploy / restart** the app process so `featureFlag.js` cache clears (flag is read once at module load).
3. **Verify kill switch checklist** above on the affected build (smoke toggle + dispose count).
4. **Confirm telemetry:** `LIFECYCLE` log shows dispose-on-toggle returning (legacy path active).
5. **Post-mortem:** File issue referencing A.0 log excerpt + repro matrix row; do not re-enable until root cause closed and gates re-run.

**No code rollback required** if only the env var changed — the legacy path is the default in prod and is preserved in code behind the flag.

---

## Related files

- `src/lib/pizarra/featureFlag.js` — `isPizarraSharedViewEnabled`, `getFlagSource`, `getRolloutStage`
- `src/components/terminal/SharedTerminalSurface.jsx` — registrar + portal (no-op when flag OFF)
- `docs/errores/03-terminal-canvas-glyph-corruption/baseline-metrics.md` — A.0 headline metric
- `docs/delegation/00-shared-context.md` — cross-agent dependency table
