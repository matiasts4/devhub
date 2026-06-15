# Matriz de cobertura — lifecycle × constelación L1–L6

Leyenda: ✅ aplicado · ⚠️ parcial · ❌ faltante · N/A no aplica

| Lifecycle trigger                      | Archivo(s) principal(es)                                    | L1  | L2  | L3  | L4  | L5  | L6  | Prioridad                                                                    |
| -------------------------------------- | ----------------------------------------------------------- | --- | --- | --- | --- | --- | --- | ---------------------------------------------------------------------------- |
| **Pizarra ↔ workspace toggle**         | TWM, PizarraPane, SharedTerminalSurface                     | ✅  | N/A | ✅  | ✅  | ✅  | ✅  | — (referencia)                                                               |
| **Workspace window switch (V1↔V2)**    | TWM `activeWsId` effect, PizarraPane                        | ✅  | N/A | ⚠️  | ⚠️  | ✅  | ⚠️  | P2                                                                           |
| **Swarm launch (N paneles)**           | TWM `createWorkspaceForSwarmLaunchRequests`, hook duplicado | ⚠️  | ❌  | ⚠️  | ⚠️  | ✅  | ⚠️  | **P0**                                                                       |
| **Swarm bootstrap / prompt injection** | TWM wrapper-sent, TerminalTTY opencode-ready + freeze       | ⚠️  | N/A | N/A | N/A | ⚠️  | ⚠️  | **P0** (G-04) — ver [05](./05-swarm-bootstrap-injection-debug-2026-06-13.md) |
| **Cerrar pestaña (panel-close)**       | TWM `handleClosePanel`                                      | ✅  | ✅  | ✅  | ⚠️  | ✅  | ✅  | P1 (reciente)                                                                |
| **Cerrar workspace completo**          | TWM `handleRemoveWorkspace`                                 | ✅  | ✅  | ⚠️  | ⚠️  | ✅  | ⚠️  | P2                                                                           |
| **Split horizontal / down**            | TWM `handleSplit`                                           | ❌  | ❌  | ⚠️  | ⚠️  | ✅  | ⚠️  | **P1**                                                                       |
| **Panel focus toggle**                 | TWM `schedulePanelFocusLayoutSync`                          | ⚠️  | ❌  | ⚠️  | ⚠️  | ⚠️  | ⚠️  | P2                                                                           |
| **Drag resize (internal split)**       | TWM `panel-group-layout`                                    | ⚠️  | N/A | ⚠️  | ⚠️  | ✅  | ⚠️  | P3                                                                           |
| **Right dock resize**                  | TWM dock handlers                                           | ⚠️  | N/A | ⚠️  | ⚠️  | ✅  | ⚠️  | P3                                                                           |
| **run-agent (1 panel, no swarm)**      | TWM `handleRunAgent` → `handleSplit`                        | ❌  | ❌  | ⚠️  | ⚠️  | ✅  | ⚠️  | P2                                                                           |
| **Planning launch**                    | `launchPlanningAgent` → run-agent                           | ❌  | ❌  | ⚠️  | ⚠️  | ✅  | ⚠️  | P2                                                                           |
| **Relaunch / reopen panel**            | TWM `devhub:relaunch-panel`                                 | ❌  | ⚠️  | ⚠️  | ⚠️  | ⚠️  | ⚠️  | **P1**                                                                       |
| **Renderer mode switch**               | TerminalTTY requestedRendererMode                           | N/A | N/A | N/A | N/A | ✅  | ⚠️  | P3                                                                           |
| **Grid launcher suspend**              | TWM `shouldSuspendNativeSurfaces`                           | N/A | N/A | N/A | N/A | ⚠️  | N/A | P2 (suspend comentado)                                                       |
| **Pizarra card drag**                  | CanvasTerminal `mergeSharedTerminalSurfaceProps`            | ⚠️  | N/A | ✅  | ✅  | ✅  | ⚠️  | P3                                                                           |
| **Flag OFF (legacy direct TTY)**       | renderWorkspacePanel sin portal                             | N/A | ❌  | N/A | N/A | ⚠️  | ⚠️  | P3 (prod hasta rollout)                                                      |

---

## Por qué pizarra quedó ✅ y swarm ❌

1. **Scope explícito** en `terminal-pizarra-stability/design.md` — serialización A.3 solo para `pizarra-mode-enter/exit`.
2. **Matriz A.0** (`baseline-metrics.md` filas 1–7) no incluía swarm ni panel-close.
3. **Dispatchers duplicados** — swarm tiene burst propio en TWM (~L4217) pero sin L2 ni guards L3 al crear 5 portales a la vez.
4. **Hook vs TWM** — `useSwarmLaunchController.syncActiveWindowSnapshot` es no-op; el hook no hereda fixes del manager.
5. **Diseño A.2** — asume callers correctos; swarm crea muchos paneles con `isVisibleInLayout` transitoriamente falso en standby.

---

## Duplicación de código (amplifica gaps)

| Función                                 | `useSwarmLaunchController.js` | `TerminalWorkspacesManager.jsx` |
| --------------------------------------- | ----------------------------- | ------------------------------- |
| `createWorkspaceForSwarmLaunchRequests` | Copia                         | Canónica (+ layout burst)       |
| `syncActiveWindowSnapshot`              | **No-op**                     | Implementada                    |
| `persistAgentRunMetadata`               | Versión reducida              | Versión completa                |
| `enqueueSwarmLaunchRequest` / flush     | Sí                            | Sí (duplicado)                  |

**Regla:** cualquier fix L1–L2 en swarm debe aplicarse en **un solo lugar** tras Fase 1 del plan.

---

## Escenarios TUI (misma matriz, mayor severidad)

| TUI                                 | Riesgo extra                                       | Crashes típicos  |
| ----------------------------------- | -------------------------------------------------- | ---------------- |
| **OpenCode** (`opencode --agent …`) | `tuiSessionActive`, canvas en splits, footer/wheel | C-02, V-01, G-03 |
| **grok / Ink**                      | wheel SGR, focus reporting                         | G-01, G-02       |
| **Claude Code**                     | similar OpenCode TUI                               | C-02, V-01       |
| **Shell bash**                      | menor refresh pressure                             | V-03, G-03       |

No hay path de renderer separado por agente — el gap es siempre de **lifecycle**.
