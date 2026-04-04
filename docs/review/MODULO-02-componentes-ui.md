# Módulo 2: Componentes UI — REPORTE DE REVISIÓN

> **Fecha:** Abril 2026
> **Estado:** ✅ Revisado
> **Total de componentes:** 76 (28 chat + 18 generales + 48 ui + 2 terminal)
> **Hallazgo principal:** ~40% de componentes UI no se usan, varios bugs de runtime

---

## 🔴 Bugs de Runtime (Críticos)

| Componente                 | Bug                                                     | Línea | Impacto                        |
| -------------------------- | ------------------------------------------------------- | ----- | ------------------------------ |
| `EquipoSettings.jsx`       | Importa `userPlus` de lucide (no existe, es `UserPlus`) | —     | 💥 Crash al importar           |
| `TerminalTTY.jsx`          | Llama `setInitError()` pero el estado no existe         | 177   | 💥 Crash al iniciar terminal   |
| `ProjectIndexRedirect.jsx` | Usa `next/navigation` en app de React Router            | —     | 💥 No funciona                 |
| `BashToolCard.jsx`         | `group-hover` sin clase `group` en padre                | 182   | 🐛 Hover actions invisibles    |
| `BannerIA.jsx`             | `createClient()` en render (no memoizado)               | 16    | ⚠️ Nuevo cliente por re-render |
| `EquipoSettings.jsx`       | `createClient()` en render (no memoizado)               | —     | ⚠️ Nuevo cliente por re-render |
| `TaskComments.jsx`         | `createClient()` en render (no memoizado)               | 12    | ⚠️ Nuevo cliente por re-render |
| `PresenceAvatars.jsx`      | `createClient()` en render (no memoizado)               | 2     | ⚠️ Nuevo cliente por re-render |

---

## 💀 Componentes Muertos (no importados en ningún lado)

### Generales (7 componentes)

| Componente                 | Líneas | Qué hace                               | Por qué está muerto                       |
| -------------------------- | ------ | -------------------------------------- | ----------------------------------------- |
| `BannerIA.jsx`             | ~80    | Barra de prompt IA para dashboard      | No se importa desde ningún lado           |
| `DiffViewer.jsx`           | ~120   | Visor de diffs con approve/reject      | No se importa                             |
| `EquipoSettings.jsx`       | ~100   | Gestión de equipo (con bug de import)  | No se importa                             |
| `ProjectIndexRedirect.jsx` | ~15    | Redirect de proyecto (con bug Next.js) | No se importa                             |
| `RealtimeBridge.jsx`       | ~60    | WebSocket bridge para fs-change        | No se importa                             |
| `Sidebar.jsx`              | ~100   | Sidebar global (dice "DevNexus")       | Reemplazado por WorkspaceSidebar          |
| `TerminalTabsManager.jsx`  | ~150   | Manager de tabs de terminal            | Reemplazado por TerminalWorkspacesManager |

### Chat (2 componentes)

| Componente             | Líneas | Qué hace                    | Por qué está muerto |
| ---------------------- | ------ | --------------------------- | ------------------- |
| `FileContextPanel.jsx` | ~80    | Panel de archivos adjuntos  | No se importa       |
| `FileDiffPreview.jsx`  | ~100   | Visor de diffs side-by-side | No se importa       |

### UI shadcn (34 componentes)

| Componente                        | Estado                                             |
| --------------------------------- | -------------------------------------------------- |
| `alert-dialog.jsx`                | 💀 No usado                                        |
| `alert.jsx`                       | 💀 No usado                                        |
| `aspect-ratio.jsx`                | 💀 No usado                                        |
| `avatar.jsx`                      | 💀 No usado                                        |
| `badge.jsx`                       | 💀 No usado                                        |
| `breadcrumb.jsx`                  | 💀 No usado                                        |
| `carousel.jsx`                    | 💀 No usado                                        |
| `checkbox.jsx`                    | 💀 No usado                                        |
| `collapsible.jsx`                 | 💀 No usado                                        |
| `context-menu.jsx`                | 💀 No usado                                        |
| `drawer.jsx`                      | 💀 No usado                                        |
| `form.jsx`                        | 💀 No usado (solo por form.jsx)                    |
| `hover-card.jsx`                  | 💀 No usado                                        |
| `input-otp.jsx`                   | 💀 No usado                                        |
| `input.jsx`                       | 💀 No usado                                        |
| `label.jsx`                       | 💀 No usado (solo por form.jsx)                    |
| `menubar.jsx`                     | 💀 No usado                                        |
| `navigation-menu.jsx`             | 💀 No usado                                        |
| `pagination.jsx`                  | 💀 No usado                                        |
| `progress.jsx`                    | 💀 No usado                                        |
| `radio-group.jsx`                 | 💀 No usado                                        |
| `select.jsx`                      | 💀 No usado                                        |
| `separator.jsx`                   | 💀 No usado                                        |
| `sheet.jsx`                       | 💀 No usado                                        |
| `skeleton.jsx`                    | 💀 No usado (tiene su propio Skeleton.jsx en root) |
| `slider.jsx`                      | 💀 No usado                                        |
| `sonner.jsx`                      | 💀 No usado                                        |
| `switch.jsx`                      | 💀 No usado                                        |
| `table.jsx`                       | 💀 No usado                                        |
| `tabs.jsx`                        | 💀 No usado                                        |
| `textarea.jsx`                    | 💀 No usado                                        |
| `toast.jsx`                       | 💀 No usado (solo por toaster.jsx)                 |
| `toaster.jsx`                     | 💀 No usado                                        |
| `toggle.jsx` + `toggle-group.jsx` | 💀 No usado                                        |

### Utils (1 componente)

| Archivo                                 | Problema                                                 |
| --------------------------------------- | -------------------------------------------------------- |
| `chat/utils/ansiToHtml.js` → `AnsiText` | Usa `require('react')` en archivo ESM — crash en runtime |

**Total componentes muertos: 44 de 76 (58%)**

---

## ⚠️ Código Muerto Dentro de Componentes Vivos

| Componente                                     | Issue                                                    | Línea       |
| ---------------------------------------------- | -------------------------------------------------------- | ----------- |
| `AgentLaunchModal.jsx`                         | `FileText` importado pero no usado                       | 2           |
| `FileDiffPreview.jsx`                          | `parsePatch` importado pero no usado                     | 3           |
| `Skeleton.jsx`                                 | `shimmerStyle` definido pero no usado (duplicado inline) | 7           |
| `StreamingMessage.jsx`                         | Prop `model` recibido pero no usado                      | —           |
| `SessionListModal.jsx`                         | Prop `projectId` recibido pero no usado                  | 11          |
| `SwarmTimeline.jsx`                            | Prop `tracesBySession` recibido pero no usado            | 191         |
| `TokenUsageBadge.jsx`                          | `TrendingUp` importado pero no usado                     | 2           |
| `TerminalTabsManager.jsx`                      | `ChevronDown` importado pero no usado                    | 2           |
| `TerminalWorkspacesManager.jsx`                | `extractNum` duplicado (definido 2 veces)                | 110, 159    |
| `AgentTracePanel.jsx` + `ContextToolGroup.jsx` | `CONTEXT_GROUP_TOOLS` duplicado en ambos                 | 44, 14      |
| `ChatMarkdown.jsx`                             | JSDoc duplicado (2 bloques)                              | 7-15, 16-19 |
| `DiffViewer.jsx`                               | `React` importado pero no usado                          | 1           |

---

## 🐛 Bugs Funcionales

| Componente                  | Bug                                                                       | Severidad |
| --------------------------- | ------------------------------------------------------------------------- | --------- |
| `KeyboardShortcutsHelp.jsx` | `Ctrl+?` solo cierra, no abre el modal                                    | 🟡 Media  |
| `OnboardingTour.jsx`        | `highlight` property definida pero nunca usada — no hay highlighting real | 🟡 Media  |
| `LiveTracePreview.jsx`      | `pulseTimeoutRef` no se limpia en unmount (memory leak)                   | 🟡 Media  |
| `TraceSearchBar.jsx`        | Usa `--border-color` en vez de `--border-strong` (inconsistente)          | 🟢 Baja   |
| `AgentActivityFeed.jsx`     | SSE `onerror` sin backoff — reconnect infinito                            | 🟡 Media  |
| `HistorialCommits.jsx`      | Datos 100% hardcodeados (5 commits falsos)                                | 🟡 Media  |
| `UltimasInteracciones.jsx`  | Datos 100% hardcodeados (5 interacciones falsas)                          | 🟡 Media  |
| `Sidebar.jsx`               | Dice "DevNexus" en vez de "DevHub"                                        | 🟢 Baja   |
| `MCPStatusPanel.jsx`        | Prop `collapsed` ignorado después del mount                               | 🟢 Baja   |
| `OutputViewerModal.jsx`     | Usa `document.execCommand('copy')` (deprecated)                           | 🟢 Baja   |

---

## ✅ Componentes Bien Implementados

| Componente             | Por qué está bien                                                  |
| ---------------------- | ------------------------------------------------------------------ |
| `ChatMessageList.jsx`  | Manejo de streaming, auto-scroll inteligente, múltiples turn types |
| `StreamingMessage.jsx` | Patrón RAF-synced para aislar re-renders durante streaming         |
| `CodeBlock.jsx`        | Bien documentado, copy, wrap, line numbers                         |
| `SwarmTimeline.jsx`    | ResizeObserver, Gantt-style bien implementado                      |
| `StatusSignal.jsx`     | Custom component limpio con tone variants                          |
| `date-picker.jsx`      | Customización legítima (Spanish locale + event-shaping)            |
| `tagStateMachine.js`   | State machine bien documentada y limpia                            |
| `detectMcpOutput.js`   | Tiny, clean, hace una cosa bien                                    |
| `TerminalThemeSync.js` | Conversión de CSS vars a xterm theme, limpio                       |

---

## 📊 Resumen por Categoría

| Categoría          | Total  | Vivos  | Muertos | Bugs      |
| ------------------ | ------ | ------ | ------- | --------- |
| Chat components    | 28     | 26     | 2       | 8 menores |
| General components | 18     | 11     | 7       | 3 runtime |
| UI shadcn          | 48     | 14     | 34      | 0         |
| Terminal           | 2      | 2      | 0       | 1 runtime |
| Utils              | 3      | 2      | 1       | 1 runtime |
| **Total**          | **99** | **55** | **44**  | **13**    |

---

## 🗑️ Archivos candidatos a eliminación inmediata

### Prioridad 1 — Componentes muertos con bugs

| Archivo                    | Razón                                              |
| -------------------------- | -------------------------------------------------- |
| `EquipoSettings.jsx`       | Muerto + bug de import (`userPlus`)                |
| `ProjectIndexRedirect.jsx` | Muerto + bug de Next.js imports                    |
| `Sidebar.jsx`              | Muerto + nombre incorrecto ("DevNexus")            |
| `TerminalTabsManager.jsx`  | Muerto + reemplazado por TerminalWorkspacesManager |

### Prioridad 2 — Componentes muertos limpios

| Archivo                                 | Razón                     |
| --------------------------------------- | ------------------------- |
| `BannerIA.jsx`                          | Muerto, no se importa     |
| `DiffViewer.jsx`                        | Muerto, no se importa     |
| `RealtimeBridge.jsx`                    | Muerto, no se importa     |
| `FileContextPanel.jsx`                  | Muerto, no se importa     |
| `FileDiffPreview.jsx`                   | Muerto, no se importa     |
| `chat/utils/ansiToHtml.js` → `AnsiText` | `require('react')` en ESM |

### Prioridad 3 — UI components no usados (34 archivos)

Todos los componentes shadcn/ui listados arriba que no se importan en ningún lado. Son ~1500 líneas de código que no se usan.

---

## 🔧 Fixes requeridos en componentes vivos

| Archivo                                        | Fix                                                            | Severidad  |
| ---------------------------------------------- | -------------------------------------------------------------- | ---------- |
| `TerminalTTY.jsx`                              | Agregar estado `initError` o eliminar llamada a `setInitError` | 🔴 Crítico |
| `BannerIA.jsx`                                 | Memoizar `createClient()` con `useMemo`                        | 🟡 Media   |
| `TaskComments.jsx`                             | Memoizar `createClient()` con `useMemo`                        | 🟡 Media   |
| `PresenceAvatars.jsx`                          | Memoizar `createClient()` con `useMemo`                        | 🟡 Media   |
| `BashToolCard.jsx`                             | Agregar clase `group` al padre para `group-hover`              | 🟡 Media   |
| `LiveTracePreview.jsx`                         | Limpiar `pulseTimeoutRef` en unmount                           | 🟡 Media   |
| `AgentActivityFeed.jsx`                        | Agregar backoff a reconexión SSE                               | 🟡 Media   |
| `KeyboardShortcutsHelp.jsx`                    | Toggle modal con `Ctrl+?` (abrir si cerrado)                   | 🟢 Baja    |
| `OnboardingTour.jsx`                           | Implementar highlighting o eliminar prop                       | 🟢 Baja    |
| `TraceSearchBar.jsx`                           | Usar `--border-strong` consistente                             | 🟢 Baja    |
| `TerminalWorkspacesManager.jsx`                | Eliminar `extractNum` duplicado                                | 🟢 Baja    |
| `AgentTracePanel.jsx` + `ContextToolGroup.jsx` | Extraer `CONTEXT_GROUP_TOOLS` a archivo compartido             | 🟢 Baja    |
