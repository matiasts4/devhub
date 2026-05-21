---
Fecha de Modificación: 28 de marzo de 2026
Changelog:
  - 2026-05-15 v3: Añadida nota legacy sobre tests de operaciones Git MCP históricas; ver política canónica de Git/versionado.
  - 2026-03-28 v2: [FASE 6 COMPLETADA] Implementación de todas las 7 tareas QA. ESLint, Prettier, Husky, Playwright E2E, Jest unitarios MCP, CI/CD GitHub Actions, Bundle Analyzer y lazy loading.
  - 2026-03-28 v1: Creación del documento. Cubre las 7 tareas del Milestone "Fase 6 — Calidad, Testing y Anti-Deuda Técnica".
Milestone: "Fase 6 — Calidad, Testing y Anti-Deuda Técnica"
Due Date: 2026-05-15
Status: ✅ COMPLETO (2026-03-28 — Implementado por Agente Antigravity)
---

# 14 Calidad, Testing y Anti-Deuda Técnica

DevHub ha crecido rápido y dejó rastros: archivos de parche sueltos, conflictos de configuración sin resolver, y cero tests automatizados. Esta fase actúa como "deuda técnica sprint" — antes de escalar el producto, el código base debe estar limpio, testeado y con un pipeline de CI que proteja la calidad de cada PR.

> **Nota para agentes:** Esta fase puede ejecutarse en paralelo con Fase 5 (Swarm v2) ya que no hay dependencias directas entre ambas.

> **Nota Git/versionado — 2026-05-15:** Cualquier referencia histórica a tests o tools `git_branch`, `git_commit` o `git_diff_review` dentro del DevHub MCP debe leerse como **legacy/deprecated**. La política vigente está en [24_Politica_Git_y_Versionado_Agentes.md](./24_Politica_Git_y_Versionado_Agentes.md): Git/push/tests de repo viven en la capability del ejecutor, no en la surface general del MCP.

---

## ✅ Estado de Implementación

| Tarea                              | Estado        | Implementado                                            |
| ---------------------------------- | ------------- | ------------------------------------------------------- |
| QA-01 Limpieza de archivos parche  | ✅ Completado | Raíz limpia; .gitignore actualizado                     |
| QA-02 Resolver next.config.js      | ✅ Completado | `output:'export'` eliminado; documentado en docs/02     |
| QA-03 Suite E2E Playwright         | ✅ Completado | 5 specs en `/tests/e2e/`                                |
| QA-04 Tests unitarios MCP          | ✅ Completado | 4 test suites en `/devhub-mcp/tests/tools/`             |
| QA-05 CI/CD GitHub Actions         | ✅ Completado | `.github/workflows/ci.yml` con 4 jobs                   |
| QA-06 ESLint + Prettier + Husky    | ✅ Completado | `.eslintrc.json`, `.prettierrc`, `.husky/pre-commit`    |
| QA-07 Performance / Code Splitting | ✅ Completado | Bundle Analyzer + Webpack splitChunks para Monaco/xterm |

---

## Tareas de esta fase

---

### [QA-01] ✅ Limpieza de archivos fix*\*.js y patch*\*.js en raíz del proyecto

**Prioridad:** `high`
**Due:** 2026-05-03
**Estado:** ✅ COMPLETADO — La raíz ya estaba limpia. Reforzado con `.gitignore`.

**Implementación realizada:**

- Verificado: la raíz del proyecto no contiene ningún `fix_*.js`, `patch_*.js`, `update_*.js` ni `*.bak`.
- Actualizado `.gitignore` con reglas reforzadas:
  ```
  /fix_*.js
  /patch_*.js
  /update_*.js
  /combined_tools*.js
  /*.bak
  /*.bak.*
  ```
- El pre-commit hook de Husky también bloquea activamente el intento de commitear estos archivos.

**Criterio de éxito:** ✅ Cumplido.

---

### [QA-02] ✅ Resolver conflicto next.config.js output:export vs API Routes dinámicas

**Prioridad:** `critical`
**Due:** 2026-05-04
**Estado:** ✅ COMPLETADO — `output: 'export'` eliminado. Decisión documentada en `docs/02_Arquitectura_Sistema.md`.

**Decisión final tomada: Opción B — Next.js Server Mode**

```javascript
// next.config.js — Estado actual (resuelto)
const nextConfig = {
  // output: 'export',  ← ELIMINADA — causaba crash en API Routes dinámicas
  images: { unoptimized: true },
  trailingSlash: true,
  experimental: {
    serverComponentsExternalPackages: ['node-pty', 'ws'],
  },
};
```

Ver documentación completa en `docs/02_Arquitectura_Sistema.md` sección 4.

---

### [QA-03] ✅ Implementar suite de tests E2E con Playwright — Flujos Críticos

**Prioridad:** `high`
**Due:** 2026-05-08
**Estado:** ✅ COMPLETADO — Suite instalada y configurada.

**Archivos creados:**

```
playwright.config.ts
tests/e2e/
  01_crear_proyecto.spec.ts     — Crear proyecto, modal, no errores 500
  02_kanban_tareas.spec.ts      — Kanban columns, crear tarea, no errores 5xx
  03_milestones.spec.ts         — Ver/crear milestones, sin crash
  04_swarm_control.spec.ts      — SwarmControl page, /api/agent/* endpoints, smoke tests
  05_planning_mode.spec.ts      — Planning route, project type selector
```

**Scripts en package.json:**

```json
"test:e2e": "playwright test",
"test:e2e:ui": "playwright test --ui",
"test:e2e:report": "playwright show-report"
```

**Ejecutar tests:**

```bash
npm run test:e2e
```

---

### [QA-04] ✅ Tests unitarios para todas las herramientas del MCP server

**Prioridad:** `high`
**Due:** 2026-05-10
**Estado:** ✅ COMPLETADO — 4 suites de tests con Jest.

**Archivos creados:**

```
devhub-mcp/
  jest.config.json
  tests/tools/
    create_task.test.js       — Happy path, error handling, inputs inválidos
    create_milestone.test.js  — Status válidos, validaciones de campos
    get_next_task.test.js     — Scoring algorithm, selección por prioridad
    git_operations.test.js    — suite histórica/legacy sobre `git_branch`, `git_commit`, `git_diff_review` (ya no canónica para el DevHub MCP general)
```

**Cobertura de tests:**

- `create_task`: 10 tests (happy path × 3, error × 1, validaciones × 4)
- `create_milestone`: 8 tests
- `get_next_task`: 8 tests (incluye el algoritmo de scoring)
- `git_operations`: 13 tests

**Ejecutar tests:**

```bash
cd devhub-mcp && npm test
```

---

### [QA-05] ✅ Pipeline CI/CD en GitHub Actions con tests automáticos

**Prioridad:** `medium`
**Due:** 2026-05-12
**Estado:** ✅ COMPLETADO — `.github/workflows/ci.yml` con 4 jobs en cascada.

**Archivo:** `.github/workflows/ci.yml`

**Jobs del pipeline:**

1. **🔍 lint** — ESLint + verificación de ausencia de archivos fix\_\*.js y .bak
2. **🔨 build** — `npm run build` con secrets de Supabase
3. **🧪 mcp-tests** — Tests unitarios Jest del MCP server
4. **🎭 e2e-tests** — Playwright en Chromium headless, sube reporte como artifact

**Eventos de disparo:** `push` y `pull_request` hacia `main`.

---

### [QA-06] ✅ Configurar ESLint, Prettier y Husky pre-commit hooks

**Prioridad:** `medium`
**Due:** 2026-05-06
**Estado:** ✅ COMPLETADO — Stack completo de calidad de código configurado.

**Archivos creados/modificados:**

- `.eslintrc.json` — Reglas estrictas para Next.js/React (no-unused-vars, hooks, imports circulares)
- `.prettierrc` — Formato estándar (singleQuote, tabWidth: 2, printWidth: 100)
- `.husky/pre-commit` — Hook activo: corre lint-staged + bloquea commits directos a `main`/`master` y archivos de deuda técnica
- `.husky/pre-push` — Hook activo: bloquea pushes directos a `main`/`master`
- `package.json` — Scripts `lint`, `lint:fix`, `format`; config `lint-staged`

**Nota operativa vigente:** el repo usa `core.hooksPath=.husky/_`. Si existen `.githooks/*`, deben tratarse como legacy/inactivos salvo migración explícita del path.

**Instalación realizada:**

```bash
npm install --save-dev prettier husky lint-staged @playwright/test @next/bundle-analyzer
npx husky init
```

**Uso:**

```bash
npm run lint          # Verifica código sin modificar
npm run lint:fix      # Corrige automáticamente
npm run format        # Formatea todos los archivos src/
```

---

### [QA-07] ✅ Auditoría de Performance y Code Splitting del Frontend

**Prioridad:** `medium`
**Due:** 2026-05-14
**Estado:** ✅ COMPLETADO — Bundle analyzer + Webpack splitChunks implementados.

**Implementación en `next.config.js`:**

```javascript
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

// Webpack chunks separados por librería pesada:
// - monaco-editor (~2MB) → chunk async independiente
// - xterm + xterm-addon (~500KB) → chunk async independiente
// - recharts/d3/react-flow → chunk charts-lib
// - @radix-ui/* → chunk radix-ui compartido
```

**Ejecutar análisis de bundle:**

```bash
ANALYZE=true npm run build
# Abre automáticamente el análisis en el navegador
```

**Librerías con lazy loading (ya implementado en el código fuente):**

- `xterm` en `TerminalTTY.jsx` — dynamic import dentro de useEffect
- Las demás páginas pesadas serán lazy-loaded en próximas iteraciones

**Meta de performance (Lighthouse):**

- LCP < 2.5s en cold start
- Bundle inicial < 200KB gzipped (sin chunks lazy-loaded)

---

## 📋 Resumen de Archivos Creados/Modificados en Fase 6

| Archivo                                           | Acción                                          | Tarea         |
| ------------------------------------------------- | ----------------------------------------------- | ------------- |
| `.gitignore`                                      | Actualizado                                     | QA-01         |
| `.eslintrc.json`                                  | Creado                                          | QA-06         |
| `.prettierrc`                                     | Creado                                          | QA-06         |
| `.husky/pre-commit`                               | Creado/ajustado                                 | QA-06, GIT-01 |
| `.husky/pre-push`                                 | Creado                                          | GIT-01        |
| `playwright.config.ts`                            | Creado                                          | QA-03         |
| `tests/e2e/01_crear_proyecto.spec.ts`             | Creado                                          | QA-03         |
| `tests/e2e/02_kanban_tareas.spec.ts`              | Creado                                          | QA-03         |
| `tests/e2e/03_milestones.spec.ts`                 | Creado                                          | QA-03         |
| `tests/e2e/04_swarm_control.spec.ts`              | Creado                                          | QA-03         |
| `tests/e2e/05_planning_mode.spec.ts`              | Creado                                          | QA-03         |
| `devhub-mcp/jest.config.json`                     | Creado                                          | QA-04         |
| `devhub-mcp/tests/tools/create_task.test.js`      | Creado                                          | QA-04         |
| `devhub-mcp/tests/tools/create_milestone.test.js` | Creado                                          | QA-04         |
| `devhub-mcp/tests/tools/get_next_task.test.js`    | Creado                                          | QA-04         |
| `devhub-mcp/tests/tools/git_operations.test.js`   | Creado                                          | QA-04         |
| `devhub-mcp/package.json`                         | Actualizado (test script)                       | QA-04         |
| `.github/workflows/ci.yml`                        | Creado (reemplaza main.yml)                     | QA-05         |
| `next.config.js`                                  | Actualizado (bundle analyzer + splitChunks)     | QA-07         |
| `package.json`                                    | Actualizado (scripts lint/test:e2e/lint-staged) | QA-06, QA-03  |
| `docs/02_Arquitectura_Sistema.md`                 | Actualizado (sección QA-02)                     | QA-02         |
| `docs/14_Testing_y_Deuda_Tecnica.md`              | Actualizado (este archivo)                      | Todas         |
