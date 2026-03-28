---
Fecha de Modificación: 28 de marzo de 2026
Changelog:
  - 2026-03-28 v1: Creación del documento. Cubre las 7 tareas del Milestone "Fase 6 — Calidad, Testing y Anti-Deuda Técnica".
Milestone: "Fase 6 — Calidad, Testing y Anti-Deuda Técnica"
Due Date: 2026-05-15
---

# 14 Calidad, Testing y Anti-Deuda Técnica

DevHub ha crecido rápido y dejó rastros: archivos de parche sueltos, conflictos de configuración sin resolver, y cero tests automatizados. Esta fase actúa como "deuda técnica sprint" — antes de escalar el producto, el código base debe estar limpio, testeado y con un pipeline de CI que proteja la calidad de cada PR.

> **Nota para agentes:** Esta fase puede ejecutarse en paralelo con Fase 5 (Swarm v2) ya que no hay dependencias directas entre ambas.

---

## Tareas de esta fase

---

### [QA-01] Limpieza de archivos fix_*.js y patch_*.js en raíz del proyecto

**Prioridad:** `high`
**Due:** 2026-05-03
**Responsable:** CLI-Worker

**Descripción completa:**
En la raíz del proyecto existen los siguientes archivos de parche que surgieron como soluciones rápidas durante el desarrollo. Deben ser eliminados o integrados formalmente:

| Archivo | Acción recomendada |
|---------|-------------------|
| `fix_code_editor_multimedia.js` | Revisar si sus cambios ya están en `CodeEditor.jsx`. Si sí → eliminar. |
| `fix_merge.js` | Revisar si el fix de merge ya está en el MCP o `combine_tools.js`. Si sí → eliminar. |
| `fix_treenode.js` | Revisar si el componente TreeNode ya tiene el fix integrado. Si sí → eliminar. |
| `patch_server.js` | Determinar si su lógica está ya en `devhub-mcp/server.js`. Integrar o eliminar. |
| `refactor_colors.js` | Verificar si el refactor de colores ya se aplicó al CSS/Tailwind. Eliminar. |
| `tools_patch.js` | Revisar si está integrado en `combined_tools.js`. Eliminar si es redundante. |
| `tools_patch_terminal.js` | Revisar si el fix de terminal está en `TerminalTTY.jsx` o en el backend. Eliminar. |
| `update_centro_ia.js` | Verificar si `CentroIA.jsx` ya tiene los cambios. Eliminar. |
| `combined_tools.js` | Evaluar si debe quedar como utilidad permanente o integrarse en el MCP. |
| `middleware.js.bak` | Archivar en `/archive` o eliminar definitivamente. |
| `devhub-mcp/fix_doc.js` | Revisar contenido. Integrar en `server.js` si aplica. |
| `devhub-mcp/fix_editor.js` | Ídem. |
| `devhub-mcp/fix_editor2.cjs` | Ídem. |

**Procedimiento:**
1. Para cada archivo: leer su contenido y verificar si el código ya está integrado en los archivos fuente principales.
2. Si está integrado → `git rm [archivo]`.
3. Si NO está integrado → crear un PR/commit que lo integre formalmente, luego eliminarlo.
4. Actualizar el `.gitignore` para rechazar archivos con patrón `fix_*.js` y `patch_*.js` en la raíz.

**Criterio de éxito:** La raíz del proyecto no contiene ningún archivo `fix_*.js`, `patch_*.js`, `update_*.js` ni `*.bak`.

---

### [QA-02] Resolver conflicto next.config.js output:export vs API Routes dinámicas

**Prioridad:** `critical`
**Due:** 2026-05-04
**Responsable:** Arquitecto / Backend-Worker

**Descripción completa:**
Este es el bug estructural más importante del proyecto. El archivo `next.config.js` actualmente contiene:

```javascript
// next.config.js (estado actual problemático)
const nextConfig = {
  output: 'export',  // ← CONFLICTO: genera sitio estático
  // ...
};
```

La directiva `output: 'export'` hace que Next.js compile todo como archivos estáticos (HTML/CSS/JS puros), **incompatible** con API Routes que requieren un servidor Node activo (como `/api/terminal/session` con node-pty, `/api/agent/execute`, etc.).

**Las dos opciones de resolución:**

**Opción A — Mantener Tauri + separar el backend:**
- Eliminar `output: 'export'` del `next.config.js`.
- Configurar Tauri para empaquetar Next.js en modo servidor usando `tauri-plugin-shell` o un sidecar.
- El backend Node-pty corre como proceso separado dentro del bundle de Tauri.
- **Ventaja:** Mantenemos la app de escritorio nativa.
- **Desventaja:** Mayor complejidad de build.

**Opción B — Abandonar Tauri, ir full web:**
- Eliminar `output: 'export'`.
- Eliminar el directorio `src-tauri/` o mantenerlo inactivo.
- Deploy en Vercel/Railway/VPS con Next.js en modo servidor.
- **Ventaja:** Mucho más simple, API Routes funcionan nativamente.
- **Desventaja:** Perdemos la app de escritorio (movida a PROD-02 con PWA como alternativa).

**Acción inmediata (independiente de la opción elegida):**
```javascript
// next.config.js — quitar en ambos casos
const nextConfig = {
  // output: 'export',  ← ELIMINAR ESTA LÍNEA
  reactStrictMode: true,
  // ...resto de config sin cambios
};
```

**Documentar** la decisión final en `docs/02_Arquitectura_Sistema.md` bajo una nueva sección "Decisión: Modo de Compilación".

---

### [QA-03] Implementar suite de tests E2E con Playwright — Flujos Críticos

**Prioridad:** `high`
**Due:** 2026-05-08
**Responsable:** QA-Worker

**Descripción completa:**
Instalar Playwright y crear la suite de tests E2E que cubra los flujos que más frecuentemente se rompen durante el desarrollo.

**Instalación:**
```bash
npm install -D @playwright/test
npx playwright install chromium
```

**Estructura de archivos:**
```
tests/
  e2e/
    01_crear_proyecto.spec.ts
    02_kanban_tareas.spec.ts
    03_milestones.spec.ts
    04_swarm_control.spec.ts
    05_planning_mode.spec.ts
  fixtures/
    test_project.json
```

**Tests a implementar:**

**Test 1 — Crear Proyecto:**
```typescript
test('crear proyecto con Planning IA', async ({ page }) => {
  await page.goto('/hub');
  await page.click('[data-testid="btn-nuevo-proyecto"]');
  await page.fill('[data-testid="input-nombre"]', 'Test Project E2E');
  await page.click('[data-testid="btn-confirmar"]');
  await expect(page).toHaveURL(/\/project\/.+\/planning/);
});
```

**Test 2 — Kanban:**
- Crear tarea desde el Kanban.
- Verificar que aparece en columna "Pendiente".
- Arrastrar a "En Progreso".
- Verificar que el estado en DB se actualiza.

**Test 3 — Milestones:**
- Crear milestone.
- Asignar tarea al milestone.
- Verificar que aparece el badge de milestone en la tarjeta.

**Test 4 — SwarmControl:**
- Navegar a `/project/:id/swarm-control`.
- Verificar que la página carga sin crash (no hay errores 500).
- Verificar que los endpoints `/api/agent/branches` y `/api/agent/status` responden 200.

**Script en package.json:**
```json
"scripts": {
  "test:e2e": "playwright test",
  "test:e2e:ui": "playwright test --ui"
}
```

---

### [QA-04] Tests unitarios para todas las herramientas del MCP server

**Prioridad:** `high`
**Due:** 2026-05-10
**Responsable:** MCP-Worker / QA-Worker

**Descripción completa:**
El MCP server es el core del sistema. Cualquier bug en sus tools rompe por completo el flujo de los agentes. Es crítico tener tests que se puedan correr en CI.

**Instalación:**
```bash
cd devhub-mcp && npm install -D jest @jest/globals
```

**Estructura:**
```
devhub-mcp/
  tests/
    tools/
      get_project_context.test.js
      create_task.test.js
      create_milestone.test.js
      get_next_task.test.js
      git_branch.test.js
      git_commit.test.js
      git_diff_review.test.js
```

**Patrón de test (ejemplo):**
```javascript
// tests/tools/create_task.test.js
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const mockSupabase = {
  from: jest.fn(() => ({
    insert: jest.fn(() => ({ select: jest.fn(() => ({ data: [mockTask], error: null })) }))
  }))
};

describe('create_task tool', () => {
  it('crea una tarea con los campos requeridos', async () => {
    const result = await createTaskTool({ project_id: 'uuid', user_id: 'uuid', title: 'Test' }, mockSupabase);
    expect(result.created).toBe(true);
    expect(result.task.title).toBe('Test');
  });

  it('falla si falta project_id', async () => {
    await expect(createTaskTool({ user_id: 'uuid', title: 'Test' }, mockSupabase))
      .rejects.toThrow();
  });

  it('falla si el título está vacío', async () => {
    await expect(createTaskTool({ project_id: 'uuid', user_id: 'uuid', title: '' }, mockSupabase))
      .rejects.toThrow('minLength');
  });
});
```

**Cobertura mínima requerida:** Happy path + error handling + inputs inválidos para cada tool.

---

### [QA-05] Pipeline CI/CD en GitHub Actions con tests automáticos

**Prioridad:** `medium`
**Due:** 2026-05-12
**Responsable:** DevOps-Worker

**Descripción completa:**
Crear el workflow de CI que se ejecuta automáticamente en cada Pull Request hacia `main`.

**Archivo a crear:** `.github/workflows/ci.yml`

```yaml
name: CI — DevHub Quality Gate

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  quality-gate:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: Instalar dependencias
        run: npm ci
      
      - name: Linting ESLint
        run: npm run lint
      
      - name: Build (verificar que compila)
        run: npm run build
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}
      
      - name: Tests unitarios MCP
        run: cd devhub-mcp && npm test
      
      - name: Instalar Playwright
        run: npx playwright install --with-deps chromium
      
      - name: Tests E2E
        run: npm run test:e2e
        env:
          BASE_URL: http://localhost:3000
      
      - name: Verificar ausencia de archivos fix_*.js en raíz
        run: |
          if ls fix_*.js patch_*.js update_*.js 2>/dev/null; then
            echo "❌ ERROR: Archivos de parche encontrados en raíz. Elimínalos antes de hacer merge."
            exit 1
          fi
          echo "✅ Raíz limpia"
```

**Añadir badge en README.md:**
```markdown
[![CI Status](https://github.com/[usuario]/devhub/actions/workflows/ci.yml/badge.svg)](https://github.com/[usuario]/devhub/actions/workflows/ci.yml)
```

---

### [QA-06] Configurar ESLint, Prettier y Husky pre-commit hooks

**Prioridad:** `medium`
**Due:** 2026-05-06
**Responsable:** CLI-Worker

**Descripción completa:**
Estandarizar el estilo del código en todo el proyecto para que los agentes generen código consistente y las reviews sean más rápidas.

**Instalación:**
```bash
npm install -D eslint prettier eslint-config-prettier husky lint-staged
npx husky init
```

**Configuración `.eslintrc.json`:**
```json
{
  "extends": ["next/core-web-vitals", "prettier"],
  "rules": {
    "no-console": ["warn", { "allow": ["error", "warn"] }],
    "no-unused-vars": "error",
    "import/no-circular-imports": "error"
  }
}
```

**Configuración `.prettierrc`:**
```json
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100
}
```

**Pre-commit hook (`.husky/pre-commit`):**
```bash
#!/usr/bin/env sh
npx lint-staged
```

**`lint-staged` en `package.json`:**
```json
{
  "lint-staged": {
    "*.{js,jsx,ts,tsx}": ["eslint --fix", "prettier --write"],
    "*.{css,json,md}": ["prettier --write"],
    "*.js": ["node -e \"const f=process.argv[1]; if(/^(fix_|patch_|update_)/.test(require('path').basename(f))) { console.error('❌ Archivos fix_/patch_ no permitidos'); process.exit(1); }\""]
  }
}
```

---

### [QA-07] Auditoría de Performance y Code Splitting del Frontend

**Prioridad:** `medium`
**Due:** 2026-05-14
**Responsable:** UI-Worker / Performance-Worker

**Descripción completa:**
DevHub carga librerías pesadas: Monaco Editor (~2MB), xterm.js (~500KB), y potencialmente react-flow. Sin code splitting, el bundle inicial es demasiado grande para una app de productividad.

**Instalación del analizador:**
```bash
npm install -D @next/bundle-analyzer
```

**Configuración en `next.config.js`:**
```javascript
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});
module.exports = withBundleAnalyzer(nextConfig);
```

**Ejecutar análisis:**
```bash
ANALYZE=true npm run build
```

**Acciones a implementar según resultados esperados:**

| Librería | Acción de optimización |
|---------|----------------------|
| Monaco Editor | `dynamic(() => import('@monaco-editor/react'), { ssr: false })` |
| xterm.js | `dynamic(() => import('./TerminalTTY'), { ssr: false })` |
| react-flow | `dynamic(() => import('./GrafoDependencias'), { ssr: false })` |
| Páginas pesadas | `dynamic(() => import('@/pages/CodeEditor'), { loading: () => <Spinner/> })` |

**Meta de performance (Lighthouse en cold start):**
- LCP (Largest Contentful Paint): < 2.5s
- FID (First Input Delay): < 100ms
- CLS (Cumulative Layout Shift): < 0.1
- Bundle inicial: < 200KB gzipped (sin las librerías lazy-loaded)
