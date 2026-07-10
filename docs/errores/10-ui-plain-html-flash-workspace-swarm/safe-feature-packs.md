# Packs de features “seguras” sobre baseline estable

**Baseline actual:** `recover/stable-2026-07-05-pre-webview2` @ `5c4bc55a`  
**Fuente KEEP (swarm/launch, sin flash/browser):** `df3f6305` / `a433b33f`  
**Fuente strip+thrash (NO usar de golpe):** `696efbe2` + stash thrash

Objetivo: reintroducir **producto útil** (Zed, swarm modal, transcripts, Grok client del asistente) **sin** el stack de thrash/WebView2/load-optim.

---

## Nota sobre “Croc / Crook”

No hay archivo ni commit con el nombre `croc`/`crook` en el árbol. Lo más cercano a lo que describís:

| Lo que dijiste                | Candidato en el repo                                                                                                  |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Integración + transcripciones | `agentLaunchWrapper` **T-016.4** transcript via `tmux pipe-pane` + **T-016.5** `devhub swarm-logs`                    |
| “Grok” / clientes TUI         | `grokClient.js`, `streamGrok.js`, listado Grok en wizard swarm, scroll TUI (este último **es** terminal → más riesgo) |
| Asistente Zed                 | `ZedAmbientOverlay`, `useZedChat`, voz, settings                                                                      |

Si “croc” es otra cosa (CLI externa, feature con otro nombre), decime y lo buscamos.

---

## Catálogo (orden recomendado)

### Pack A — Swarm modal UI ✅ aplicando primero

**Riesgo:** bajo (UI del wizard, no motor de terminales)  
**Fuente:** `df3f6305`  
**Archivos:**

- `src/components/control-room/SwarmLaunchWizardModal.jsx`
- `src/components/control-room/SwarmSurfaceCard.jsx`
- `src/components/control-room/__tests__/SwarmLaunchWizardModal.test.jsx`

**Qué trae:** wizard más completo (modelos TUI, Grok en lista, UX launch).

### Pack B — Launch + transcripts (sin terminal paint)

**Riesgo:** medio-bajo (shell wrappers del swarm; no xterm/WebView2)  
**Fuente:** `df3f6305`  
**Archivos:**

- `src/lib/agentLaunchWrapper.js` (+ tests)
- `src/lib/agentLaunchCommand.shared.js` (+ tests agentLaunchCwd)
- `src/lib/operations/materializeLaunchWrapper.js`
- `src/lib/operations/swarmControl.js` (+ tests)
- `sidecar-backend/cwdGuard.js`
- `src/components/workspace/workspaceScopedStorage.js` (+ tests si existen)
- opcional CLI: `devhub-cli/commands/swarm-logs.js` desde `8e2e45aa`

**Qué trae:** transcripts por agente, inject/bootstrap, WSL paths, storage scoped.

### Pack C — Asistente Zed + Grok (chat), sin scroll TUI

**Riesgo:** medio (API/chat/overlay; **no** traer wheel/SGR de Grok en xterm)  
**Fuente:** `a433b33f` o `a4853bba` (diff 5c4bc→a433)  
**Archivos (núcleo):**

- `src/components/asistente/ZedAmbientOverlay.jsx`
- `src/components/asistente/ZedActivityDrawer.jsx`
- `src/lib/asistente/*` (grokClient, streamGrok, runZedChatLoop, tools, …)
- `src/app/api/assistant/**`
- `src/components/settings/Zed*.jsx`
- `src/lib/voice/*` (si querés voz)

**Excluir de este pack (alto riesgo thrash):**

- cualquier fix de **scroll/wheel** Grok/OpenCode/Kimi en `TerminalTTY*` / `useTerminalWheel*`
- `useTerminalLayoutChurnRecovery`, soft reveal GPU, etc.

### Pack D — WebView2 mínimo (solo si necesitás browser)

**Riesgo:** alto (ya vimos HWND/clicks/thrash)  
**Fuente:** `3b92878f` + `4659ca94` + quizá `a4853bba` resize  
**Dejar para el final** o no traer hasta que A–C estén estables.

### Pack E — Nunca de golpe en recovery

- `8b57ca27` mega checkpoint completo
- strip `88d97176` + thrash stash
- surgical **S1** (flash pin/suppress) y **S2** (browser HWND) de `wip/terminal-ui-stability-2026-07-09`

---

## Cómo decir sí/no

Respondé por packs, por ejemplo:

- `A sí` — modal swarm
- `B sí` — launch + transcripts
- `C sí sin voz` — Zed/Grok chat sin voice
- `C voz también`
- `D no` — sin browser
- `scroll grok no` — no traer wheel TUI

---

## Estado de aplicación (2026-07-10)

| Pack                      | Estado                                                                           |
| ------------------------- | -------------------------------------------------------------------------------- |
| A Swarm modal UI          | **aplicado** desde `df3f6305` (tests modal 9/9)                                  |
| B Launch/transcripts      | **aplicado** desde `df3f6305` (wrappers, swarmControl, scoped storage, cwdGuard) |
| C Zed/Grok chat           | **aplicado con criterio** desde `a433b33f` — ver exclusiones abajo               |
| D WebView2                | **no** (pedido usuario)                                                          |
| E thrash/scroll TUI/optim | **no** (pedido usuario)                                                          |

### Pack C — estado completo (pedido usuario 2026-07-10)

**Traído (producto Grok/Zed + capas pedidas):**

- `grokClient` / `streamGrok` + tests
- `resolveZedApiKey` + `xai-oauth` (SuperGrok OAuth)
- `chat/route.js`, `zed-provider-status`
- `runZedChatLoop` (stream multi-provider)
- `zedConversationAdapter`, `zedOverlaySettings`
- Settings: `ZedModelSettings`, `ZedOverlaySettings`, **`ZedVoiceSettings`** + wiring restore modal
- API OAuth xAI: device-flow + poll
- **`zedFastPath` / `runZedFastPath` / `zedFastPathResponse` + tests**
- **`ZedAmbientOverlay` + `ZedActivityDrawer` motion** + tests
- **Voice/TTS:** `useVoiceTts`, `voiceFeatureFlag`, catalog, `resolveVoiceEngineConfig`
- `globals.css` aura speed + `data-motion-mode` reduced gate (+ zedAuraCss tests)
- `zed-logger` updates (deps de chat/fastPath)

**Sigue FUERA (explícito):**

- scroll/wheel Grok/Kimi/OpenCode en **terminales** (TUI)
- WebView2 / browser HWND / packs S1–S2 thrash

**Tests Pack C completo:** fastPath, voice TTS, voice settings, overlay/drawer motion, aura CSS — **108/108 OK**.

### Packs F / G / J′ (2026-07-10, post 5-jul same line)

| Pack                     | Estado                  | Fuente                                                                                                        | Cuidado                                                                           |
| ------------------------ | ----------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **G** clipboard terminal | **aplicado**            | `useTerminalClipboard` a433 + helpers paste (surgical en `TerminalTTY.helpers`, no dump de 485 líneas thrash) | bracketed paste multilinea TUI                                                    |
| **J′** grokReadyMarker   | **aplicado**            | archivo + wire en `ttyServer` detect chain                                                                    | solo detección, no scroll                                                         |
| **F** pizarra polish     | **aplicado con filtro** | pane/canvas/menu/swipe/palette/lib                                                                            | **sin** `PizarraBrowserSurface*`; autofit solo `layout-settled` si hay `panelIds` |

Tests: terminalClipboard, pizarraClipboard, context menu, pane addElement — **43/43 OK**.
