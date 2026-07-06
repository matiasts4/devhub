# Investigation notes (herdr clone)

**Clone:** `.research/herdr` (shallow, 2026-07-06)  
**Compare script:** `node scripts/compare-herdr-manifests.mjs`

## Manifest parity (5 agentes DevHub)

| Agente   | herdr version    | devhub version   | Reglas herdr | Reglas devhub | Gap                                                                                                            |
| -------- | ---------------- | ---------------- | ------------ | ------------- | -------------------------------------------------------------------------------------------------------------- |
| kimi     | 2026.06.10.1     | 2026.06.10.1     | 6            | 6             | OK                                                                                                             |
| claude   | 2026.06.10.3     | 2026.06.10.3     | 11           | 10            | Falta `osc_progress_idle` + región `osc_progress` no implementada en `ruleEngine.js`                           |
| codex    | 2026.06.10.3     | 2026.06.10.3     | 6            | 6             | OK (IDs)                                                                                                       |
| opencode | 2026.06.10.1     | 2026.06.10.1     | 3            | 3             | OK (IDs)                                                                                                       |
| grok     | **2026.07.03.1** | **2026.06.10.1** | 8            | 2             | **Crítico:** UI Grok Build 0.2.x (spinner + `[stop]`, diálogos `┃`, footers `esc:cancel` / `ctrl+.:shortcuts`) |

### Reglas grok ausentes en DevHub

- `option_dialog_blocked`, `permission_hints_blocked`, `question_dialog_hints_blocked`
- `spinner_status_working`, `esc_cancel_hints_working`, `prompt_hints_idle`
- (herdr mantiene `permission_scope_selector` y `waiting_tool_working` para releases viejas)

## Motor herdr (referencia código)

| Pieza                          | Ruta herdr                                                                             |
| ------------------------------ | -------------------------------------------------------------------------------------- |
| Tipos + agentes                | `src/detect/mod.rs`                                                                    |
| Evaluación manifests + explain | `src/detect/manifest.rs`                                                               |
| Anti-flicker                   | `src/pane/agent_detection.rs` (700ms cap, 3×100ms confirm, 800ms blocker refresh)      |
| Validación manifests           | `scripts/agent_detection_manifest_check.py` (regiones permitidas, límites complejidad) |
| CLI debug                      | `herdr agent explain`, `herdr agent read --source detection`                           |

**Regiones herdr no portadas en DevHub `getRegion()`:**  
`osc_progress`, `before_current_prompt_marker`, `whole_recent_without_current_prompt_marker`, `current_prompt_block_marker`, `after_current_prompt_block_marker`, `above_prompt_box`, `last_non_empty_above_prompt_box`, …

DevHub solo: `whole_recent`, `osc_title`, `bottom_lines(N)`, `bottom_non_empty_lines(N)`, `after_last_prompt_marker`, `after_last_horizontal_rule`, `prompt_box_body`.

## DevHub wiring (confirmado)

| Ruta                            | herdr-style completo                                                       |
| ------------------------------- | -------------------------------------------------------------------------- |
| `src/lib/terminal/ttyServer.js` | Sí: `detectionBuffer`, `detectAgentState`, `AgentStateMachine.publish`     |
| `sidecar-backend/server.js`     | **No:** regex por chunk, sin SM ni buffer                                  |
| UI                              | `derivePanelStatus` mezcla `liveActivity` (bytes) y `agentTuiState` (poll) |

## herdr: 18 manifests bundled

`amp`, `antigravity`, `claude`, `cline`, `codex`, `cursor`, `devin`, `droid`, `gemini`, `github-copilot`, `grok`, `hermes`, `kilo`, `kimi`, `kiro`, `opencode`, `pi`, `qodercli` — DevHub solo 5 (+ hermes sin manifest).

## Próximas acciones investigación

1. Portar `grok.toml` → `grok.js` desde clone (prioridad producto).
2. Añadir `osc_progress` parser + regla claude `osc_progress_idle`.
3. Leer `src/pane.rs` task loop para documentar intervalo detección y `detection_text()` semantics vs buffer 8KB DevHub.
4. Prototipo CJS bundle del motor para sidecar (task 1.1).
5. Capturas: usar `scripts/capture_agent_screen.py` de herdr como referencia para fixtures DevHub `tests/fixtures/agent-screens/`.
