# Prompt — Agente 4: Diseño / UI Professionalization

> Copia todo este documento como prompt inicial en tu sesión OpenCode.
> Lee primero [`00-shared-context.md`](00-shared-context.md).

---

## Misión

Retomar el SDD **`sdd/ui-professionalization`** desde la fase **propose** (explore ya existe) para consolidar shell, tipografía, settings único y tokens. Aprovechar morphology ya en código sin reimplementarla. Ejecuta SDD completo hasta apply.

**Paralelo:** no bloquea otros agentes. Evita conflictos en archivos que otros tocan (`TerminalTTY.jsx`, `ZedAmbientOverlay.jsx`, `pizarra/*`).

---

## Punto de partida verificado (NO confiar en tasks.md stale)

| Track | Estado real |
|-------|-------------|
| [`sdd/ui-professionalization/explore/exploration.md`](../../sdd/ui-professionalization/explore/exploration.md) | ✅ Único artefacto — **continuar desde propose** |
| `openspec/brutalist-stage-morphology` | Infra aplicada; verify FAIL por scope; **no re-aplicar** |
| `openspec/morphology-system-refactor` | Código ~done; `tasks.md` sin marcar — **bookkeeping** |
| `openspec/terminal-zone-appearance` | Código done; sin verify-report |
| [`docs/41_Brutalist_Stage_Session_Handoff.md`](../41_Brutalist_Stage_Session_Handoff.md) | Doc más honesta: infra sí, visual fuerte no |

**Morphology ya en código:** `themes.js` (`default`, `brutalist-stage`, `aura`, `switchyard`), `globals.css` `[data-morphology]`, `chrome-surface.jsx`, `morphology.js` factories.

**Goals ui-professionalization NO hechos:** shell unificado, tipografía tokenizada, settings único, un CSS entry, eliminar hex hardcoded en vistas piloto.

---

## Comportamiento esperado — Requisitos funcionales

| ID | Requisito | Prioridad |
|----|-----------|-----------|
| FR-D01 | Un CSS entry canónico (`globals.css`); `index.css` retirado o thin re-export | P1 |
| FR-D02 | Settings apariencia: una superficie App Router; deprecar duplicado `Ajustes.jsx` | P1 |
| FR-D03 | `UiShell`/`UiHeader` en Dashboard, Proyectos, ProjectHub, Settings, Roadmap | P1 |
| FR-D04 | Escala tipográfica tokenizada; reducir `text-[10px]`/`text-[11px]` en vistas piloto | P2 |
| FR-D05 | Terminal chrome + pizarra Konva usan CSS vars (no hex) — **solo si no conflicta con Agentes 1/3** | P2 |
| FR-D06 | Tokens: `--warning`, `data-density` rules, fix `accent` collision en tailwind | P2 |
| FR-D07 | `components.json` → `src/app/globals.css` | P2 |
| FR-D08 | Bookkeeping: actualizar o archivar `morphology-system-refactor/tasks.md` | P2 |

## Requisitos no funcionales

- NFR-D01: `cssTokens.test.js` y E2E `05_workspace_morphology_smoke.spec.ts` siguen verdes
- NFR-D02: PRs ≤400 LOC por vista migrada
- NFR-D03: Crear `docs/DESIGN.md` corto: Theme × Morphology × Accent × Terminal chrome
- NFR-D04: No romper 10 themes × 4 morphologies existentes

---

## Lecturas obligatorias (en orden)

1. [`docs/delegation/00-shared-context.md`](00-shared-context.md)
2. [`sdd/ui-professionalization/explore/exploration.md`](../../sdd/ui-professionalization/explore/exploration.md)
3. [`docs/41_Brutalist_Stage_Session_Handoff.md`](../41_Brutalist_Stage_Session_Handoff.md)
4. [`src/lib/theme/themes.js`](../../src/lib/theme/themes.js)
5. [`src/app/globals.css`](../../src/app/globals.css) — primeras 200 líneas + morphology blocks
6. [`src/chrome/morphology.js`](../../src/chrome/morphology.js)
7. [`src/components/ui/chrome-surface.jsx`](../../src/components/ui/chrome-surface.jsx)
8. [`src/components/ui/system/ui-shell.jsx`](../../src/components/ui/system/ui-shell.jsx), `ui-header.jsx`
9. [`src/app/settings/appearance/page.jsx`](../../src/app/settings/appearance/page.jsx)
10. [`src/views/Ajustes.jsx`](../../src/views/Ajustes.jsx) — duplicado a deprecar
11. [`tailwind.config.js`](../../tailwind.config.js), [`components.json`](../../components.json)
12. [`openspec/changes/morphology-system-refactor/verify-report.md`](../../openspec/changes/morphology-system-refactor/verify-report.md)
13. [`src/components/__tests__/cssTokens.test.js`](../../src/components/__tests__/cssTokens.test.js)

---

## Alcance de archivos (puedes modificar)

- `sdd/ui-professionalization/**` (crear propose, spec, design, tasks)
- `openspec/changes/ui-professionalization/**` (opcional mirror openspec)
- `src/app/globals.css` — consolidación, tokens, NO reescribir 10 themes desde cero
- `src/index.css` — deprecar
- `components.json`, `tailwind.config.js`
- `src/components/ui/system/**`, `ui-header.jsx`, `ui-shell.jsx`
- `src/views/Dashboard.jsx`, `Proyectos.jsx`, `ProjectHub.jsx`, `Roadmap.jsx`
- `src/app/settings/**`
- `src/views/Ajustes.jsx` — redirect o banner deprecación
- `docs/DESIGN.md` (nuevo)
- `openspec/changes/morphology-system-refactor/tasks.md` — actualizar checkboxes
- `openspec/changes/terminal-zone-appearance/verify-report.md` — crear si falta

## Fuera de alcance (NO tocar)

- `TerminalTTY.jsx` internals (Agente 1)
- `ZedAmbientOverlay.jsx` (Agente 3)
- `PizarraCanvas.jsx`, animaciones pizarra (Agente 3)
- `src/lib/asistente/**` (Agente 2)
- Swarm/orquestación
- Reimplementar morphology desde cero

---

## SDD workflow — ejecutar en orden

### 1. explore
**No re-explorar desde cero.** Crear `sdd/ui-professionalization/explore/code-audit-2026-06.md`:
- grep `text-[10px]`, `text-[11px]` en views piloto
- grep headers duplicados
- estado `index.css` vs `globals.css`
- Roadmap.jsx líneas con `borderRadius: '0'` (deuda morphology-refactor)

### 2. propose
`sdd/ui-professionalization/proposal.md` basado en exploration original + audit:
- Central shell + tokenized typography + appearance consolidation
- Incremental migration (no big bang)

### 3. spec
Escenarios por FR-D01 a D08. Referenciar morphology existente como constraint.

### 4. design
- Orden migración: Settings → Dashboard → Proyectos → ProjectHub → Roadmap
- Typography scale en `ui-tokens.js` o extensión `opencode-vars.css`
- Estrategia deprecar `Ajustes.jsx` (redirect a `/settings/appearance`)

### 5. tasks (sugerencia)

| Task | Descripción |
|------|-------------|
| D1 | `index.css` → re-export; fix `components.json` |
| D2 | Tokens `--warning`, `data-density`, tailwind accent fix |
| D3 | `docs/DESIGN.md` |
| D4 | Consolidar appearance settings; deprecar Ajustes block |
| D5 | Migrar Dashboard + Proyectos a UiShell |
| D6 | Migrar ProjectHub + Settings layout |
| D7 | Migrar Roadmap; fix borderRadius overrides |
| D8 | Typography pass piloto (kill arbitrary 10px/11px) |
| D9 | Bookkeeping morphology-system-refactor tasks.md |
| D10 | verify-report + cssTokens tests |

### 6. apply → 7. verify

---

## Residual conocido (de morphology-system-refactor)

Arreglar en este paquete si cabe:
- `Roadmap.jsx` ~líneas 85, 338: `borderRadius: '0'` → usar `panelStyle()` o tokens
- `brutalPanelStyle` wrapper en `morphology.js` — evaluar deprecación documentada

---

## Entregables

- [ ] `sdd/ui-professionalization/` con propose → verify completos
- [ ] `docs/DESIGN.md`
- [ ] ≥3 vistas piloto en UiShell
- [ ] Settings apariencia único
- [ ] `morphology-system-refactor/tasks.md` reconciliado
- [ ] `[git:checkpoint]` DevHub MCP

---

## Comandos útiles

```bash
npm test -- --testPathPattern=cssTokens|themes-appearance|ui-tokens
npx playwright test tests/e2e/05_workspace_morphology_smoke.spec.ts
rg "text-\[10px\]|text-\[11px\]" src/views src/components --count
```
