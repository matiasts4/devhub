# Plan de reimplementación Kimi (sin romper terminales)

**Estado:** activo  
**Última actualización:** 2026-06-22  
**Rama de trabajo:** `task/kimi-minimal` (fork de `task/rebuild-from-stable`)  
**Baseline estable:** `stable/terminal-jun20` (`ebc5030`) + collab en `task/rebuild-from-stable` (`cca90af`)

---

## Intención

Reintroducir soporte Kimi (y piezas relacionadas) **desde cero**, capa por capa, sin reutilizar el checkpoint monolítico `12435b1` tal cual.

**Regla absoluta:** si una capa rompe terminales (scroll, delay al cambiar panel, cortes), **no se mergea**. Se revierte al último commit estable, se documenta el fallo, y se reintenta con un parche más pequeño o se pospone la capa.

Esto **no depende de memoria del agente** — este archivo es la fuente de verdad del plan, criterios de prueba y rollback.

---

## Verificación git: ¿fueron 106 archivos en un commit?

**Sí, es verdad que un solo commit tocó ~100+ archivos**, pero el número exacto y el contexto importan.

### Un commit kimi = un checkpoint apilado

| Ref | Archivos | Notas |
|-----|----------|-------|
| `12435b1` | **112 archivos** | Commit original: *"kimi runtime integration + agent-ready marker generalization"* |
| `7b769c4` | **106 archivos** | Cherry-pick en rebuild; excluimos 5 backups `devhub.db` + 1 log `.cursor/debug-*` |
| Push completo 21-jun (`ebc5030..dca2dbb`) | **158 archivos** | 13 commits apilados (splash, collab, kimi, rayitas, etc.) |

El usuario apiló commits localmente y luego hizo **un push** con todo junto. Eso es correcto: el push remoto (`backup/jun21-origin-push` → `dca2dbb`) contiene **13 commits**, no uno solo. Pero el commit kimi (`12435b1`) por sí solo ya era un checkpoint enorme.

### Desglose de los 13 commits del 21-jun (archivos por commit)

| Commit | Archivos | Tema |
|--------|----------|------|
| `f6f5868` | 2 | Splash screen |
| `f0164d4` | 2 | Splash `webview-data-url` |
| `9a09bfd` | 12 | Collab fase 0 |
| `bd81b13` | 11 | Collab fase 1 realtime |
| `fee3861` | 2 | DB schema fix |
| `2734d4e` | 8 | Collab fase 2 invitaciones |
| `43b47e7` | 2 | Launcher X11 (revertido después) |
| `97fda72` | 3 | Supabase SSR |
| `24ee4c5` | 5 | Collab fase 3 tests |
| `4d15bf7` | 2 | Revert launcher X11 |
| `4ff22ed` | 22 | Deuda técnica presencia/mocks |
| **`12435b1`** | **112** | **Kimi + Zed plan + packaging + terminal** |
| `dca2dbb` | 18 | Fix rayitas WebKit |

### Qué había dentro de `12435b1` (no todo es kimi)

| Área | ~Archivos | ¿Kimi? | ¿En rebuild actual? |
|------|-----------|--------|---------------------|
| `src/lib/asistente/*` (Zed plan, skills, engram) | ~25 | No | No (revertido) |
| `src/components/TerminalTTY.jsx` + terminal libs | ~22 | **Sí — culpable** | No |
| `src/lib/agentLaunch*` | 4 | Sí (lanzamiento) | No |
| `packaging/linux/devhub-server` + scripts | ~4 | No | No |
| `docs/errores/*` | ~13 | No (post-mortem) | No |
| `src/components/pizarra/*` | ~8 | No (canvas pan) | No |
| `devhub-mcp/data/*.backup` | 5 | Basura accidental | Nunca incluir |
| Resto (API, views, tests, tauri) | ~30 | Mixto | Parcial |

**Conclusión:** los 106–112 archivos son reales en **un solo checkpoint**, pero ~70% no es “kimi terminal” — es Zed, packaging, docs y tests que se empaquetaron en el mismo commit. La depilación posterior (revert cherry-pick, collab separado) ya limpió el árbol de trabajo; el remoto `backup/jun21-origin-push` conserva el historial completo por si hace falta consultar.

---

## Qué confirmamos que rompe terminales

Cherry-pick `12435b1` → `7b769c4` sobre baseline estable:

- Scroll TUI degradado
- Delay ~3s al cambiar entre paneles
- Flujo “cortado”

Revert `7b769c4` → `cca90af` restauró comportamiento estable.

**Causa raíz (Capas C + D):** reescritura del ciclo de vida global en `TerminalTTY.jsx` (focus DECSET, escaneo por chunk PTY, wheel sintético para adapter `"agent"`), no el splash ni `dca2dbb`.

### Excluido permanentemente del plan (hasta nueva evidencia)

| Item | Commits | Motivo |
|------|---------|--------|
| Splash screen | `f6f5868`, `f0164d4` | Sospechoso lifecycle ventanas; no necesario ahora |
| Fix rayitas WebKit | `dca2dbb` | No resolvía el problema reportado |

---

## Ramas y puntos de restauración

| Rama / tag | Commit | Uso |
|------------|--------|-----|
| `stable/terminal-jun20` | `ebc5030` | Ancla congelada — solo terminales 20-jun |
| `task/rebuild-from-stable` | `cca90af` | Producción candidata: terminales + collab |
| `task/kimi-minimal` | fork de `cca90af` | Implementación capa por capa |
| `backup/jun21-origin-push` | `dca2dbb` | Referencia histórica completa 21-jun |
| `7b769c4` | cherry-pick kimi | **Referencia de qué NO repetir** |

### Protocolo de rollback

```bash
# Si la capa N rompe terminales:
git checkout task/kimi-minimal
git reset --hard < último-commit-estable-de-esta-fase >
# Documentar en "Registro de intentos" (abajo) qué falló
```

Cada fase termina con **commit checkpoint** nombrado: `[kimi-rebuild] fase-N: <descripción>`.

---

## Capas (definición)

### Capa A — Lanzamiento (segura)

**Archivos permitidos:** `agentLaunchCommand.js`, `agentLaunchCommand.shared.js`, `agentLaunchWrapper.js`, `opencodeReadyMarker.js` (+ tests de launch)

**Qué hace:**
- Comando `kimi --yolo --auto --skills-dir … --model …`
- `KIMI_SKILL_DIRS` por rol swarm
- Marker `/tmp/devhub-agent-ready-kimi-<tmux>`
- Bootstrap bash espera marker antes de `send-keys`

**Prohibido en Capa A:** tocar `TerminalTTY.jsx`, `tuiAdapter.js`, `native_vte.rs`, wheel, focus.

---

### Capa B — Readiness mínima (riesgo medio)

**Archivos permitidos:** módulo nuevo pequeño o extensión de marker API; **no** `agentTui.js` monolítico del checkpoint.

**Qué hace:**
- Un detector: `welcome to kimi` / título PTY `]0;kimi`
- Un flag `kimiReadyRef` que pasa a `true` **una vez** (no por cada chunk)

**Prohibido:** escaneo de tail+chunk 8KB en cada mensaje WS; `agentTuiDetachedRef`.

---

### Capa C — Scroll kimi aislado (riesgo alto)

**Archivos permitidos:** rama mínima en wheel handler de `TerminalTTY.jsx` **solo** si `program === 'kimi'` y panel activo.

**Qué hace:**
- Inyección SGR wheel sintética solo para kimi
- OpenCode/Grok siguen con passthrough nativo sin cambios

**Prohibido:** adapter `"agent"` global con `passThrough: false` para todos los no-opencode; tocar `prepareActiveTuiTerminalFocus`.

---

### Capa D — Focus / mouse (riesgo muy alto — última)

**Qué hace (solo si C estable):** rebind mouse modes al mostrar panel kimi.

**Prohibido hasta Fase 4+:**
- `prepareActiveTuiTerminalFocus` con `resolveAgentTuiInteractionLive()`
- `releaseAgentTuiInteractionLocks()` en output handler
- `tuiSessionActiveRef = false` al montar paneles agente

---

### Capa E — Native VTE (paralela, opcional)

**Archivos:** `native_vte.rs`

Cambios del checkpoint: agent exit scan 450ms, no restaurar scrollback en alt-screen.

**Regla:** solo después de que xterm-webgl esté estable en Fases 1–3. Probar paneles native por separado.

---

### Capa F — No terminal (traer cuando haga falta, ramas aparte)

Zed plan executor, `devhub-server`, pizarra pan, docs errores — **commits separados**, nunca mezclados con capas A–D.

---

## Fases de implementación

Cada fase = implementar → `pnpm tauri dev` → checklist manual → commit o rollback.

### Fase 0 — Baseline ✅

- [x] `task/rebuild-from-stable` @ `cca90af` verificado estable
- [x] Kimi revertido
- [x] Collab presente

### Fase 1 — Capa A (lanzamiento)

**Objetivo:** kimi aparece en menú/swarm y abre TUI; terminales idénticas a Fase 0.

**Implementar:**
1. `case 'kimi'` en launch commands + skill dirs
2. `resolveAgentReadyMarkerPath(tmux, 'kimi')` en marker
3. Bootstrap wrapper poll genérico (sin tocar terminal UI)

**Checklist de prueba:**
- [ ] Cambio entre 3+ paneles shell: instantáneo, sin delay
- [ ] OpenCode/Grok scroll OK
- [ ] `kimi` lanza y muestra TUI (scroll kimi puede fallar — aceptable en F1)
- [ ] Collab/invitaciones siguen OK

**Rollback si:** cualquier regresión en ítems 1–2 o collab.

---

### Fase 2 — Capa B (readiness mínima)

**Objetivo:** saber cuándo kimi está listo para bootstrap; sin tocar wheel/focus.

**Implementar:**
1. Detector mínimo (1–2 regex, sin `agentTui.js` completo)
2. Escribir marker `/tmp/devhub-agent-ready-kimi-*` desde sidecar o ruta existente opencode-ready
3. Opcional: log UI “kimi ready” — sin refs en wheel handler

**Checklist:**
- [ ] Fase 1 checks siguen verdes
- [ ] Bootstrap swarm inyecta prompt tras marker (no timeout 12s)
- [ ] Sin delay nuevo al cambiar paneles

---

### Fase 3 — Capa C (scroll kimi)

**Objetivo:** scroll dentro de kimi TUI.

**Implementar:**
1. Guard en wheel: `if (isKimiCommand && panelActive && kimiReady) { inject SGR }`
2. Sin modificar ramas opencode/grok
3. Sin `nativeWheelPassthrough` global

**Checklist:**
- [ ] Scroll kimi en transcript
- [ ] Scroll opencode/grok sin regresión
- [ ] Hover-scroll (si aplica) no empeora
- [ ] Cambio panel < 500ms percibido

**Rollback si:** scroll roto en cualquier TUI o delay al focus.

---

### Fase 4 — Capa D (focus/mouse) — solo si F3 estable

Implementación mínima; si rompe, **no aplicar** — kimi puede vivir sin rebind agresivo.

---

### Fase 5 — Capa E (native VTE) — opcional

Solo paneles `native_vte`; tests aparte.

---

## Registro de intentos

| Fecha | Fase | Commit | Resultado | Notas |
|-------|------|--------|-----------|-------|
| 2026-06-22 | — | `7b769c4` | **FALLÓ** | Cherry-pick completo `12435b1`; terminales rotas |
| 2026-06-22 | 0 | `cca90af` | **OK** | Revert kimi; baseline estable |
| | 1 | | pendiente | |
| | 2 | | pendiente | |
| | 3 | | pendiente | |

*(Actualizar esta tabla en cada intento.)*

---

## Qué NO copiar de `12435b1`

- [ ] `src/lib/terminal/agentTui.js` completo
- [ ] Adapter `tuiAdapter` → `"agent"` con `wheelStrategy.passThrough: false` global
- [ ] Escaneo `detectAgentTuiReady` / `Detached` en handler de output por chunk
- [ ] `releaseAgentTuiInteractionLocks` + `agentTuiDetachedRef`
- [ ] `prepareActiveTuiTerminalFocus` acoplado a `resolveAgentTuiInteractionLive()`
- [ ] `tuiSessionActiveRef = useRef(false)` al montar
- [ ] Filtros `TERMINAL_MOUSE_DECSET_LEAK_RE` amplios (probar aislado si hace falta)
- [ ] Backups `devhub-mcp/data/*.backup-*` ni logs `.cursor/debug-*`
- [ ] Mezclar Zed plan / devhub-server / pizarra pan en el mismo commit que terminal

---

## Comandos útiles

```bash
# Ver archivos de un commit
git show 12435b1 --stat

# Comparar capa contra baseline
git diff cca90af..HEAD -- src/lib/agentLaunchCommand.js

# Probar
pnpm tauri dev

# Marcar fase estable
git commit -m "[kimi-rebuild] fase-1: launch command + marker, no TerminalTTY"
```

---

## Referencias

- Ancla terminal: `stable/terminal-jun20` (`ebc5030`)
- Checkpoint kimi original: `12435b1` (112 archivos)
- Análisis de regresión: conversación 2026-06-21/22; revert `cca90af`