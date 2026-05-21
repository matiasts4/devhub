# DevHub — Codebase Quality Audit (Delta)

> **Fecha:** 2026-04-04
> **Alcance:** Re-audit completo — verificación del reporte anterior + nuevos hallazgos
> **Stack:** Next.js 16.2.2, React 19, Tailwind v4, SQLite (better-sqlite3), Tauri 2, Telegram Bot
> **Referencia:** `CODEBASE_AUDIT_REPORT.md` (2026-04-03)

---

## Resumen Ejecutivo

El reporte anterior (`CODEBASE_AUDIT_REPORT.md`) es **preciso y completo** en sus hallazgos principales. Este delta audit confirma los hallazgos previos con evidencia directa y agrega **12 nuevos problemas** identificados desde el último scan.

**Estado general:** 🔴 **Crítico** — Sin cambios significativos desde el audit anterior. Los problemas de seguridad y arquitectura persisten sin resolver.

### Métricas Actualizadas

| Métrica                            | Valor                              | Cambio vs Anterior |
| ---------------------------------- | ---------------------------------- | ------------------ |
| API routes                         | 47                                 | +1                 |
| Componentes >500 líneas            | 9                                  | Sin cambio         |
| Componente más grande              | `SwarmControl.jsx` — 1707 líneas   | ↑ (era AgentHub)   |
| Empty catch blocks                 | 14                                 | Confirmado         |
| console.\* calls                   | 85                                 | Confirmado         |
| eslint-disable comments            | 6                                  | Confirmado         |
| Shell command routes               | 9                                  | Confirmado         |
| Líneas totales en God Components   | 9,283                              | Confirmado         |
| Funciones duplicadas en localDb.js | 3 funciones (73 líneas)            | Confirmado         |
| `sanitizeFtsQuery` duplicada       | 2 definiciones idénticas           | **NUEVO**          |
| Índice duplicado en schema         | `idx_agent_hub_sessions_parent` x2 | **NUEVO**          |
| Supabase creds en `next.config.js` | URL + anon key hardcodeadas        | Confirmado         |

---

## Hallazgos Confirmados del Reporte Anterior

### ✅ C-01: Credenciales expuestas — CONFIRMADO

- `next.config.js` líneas 20-21: Supabase URL y anon key en plaintext
- `data/llm-providers-config.json`: API keys en JSON trackeable
- `.gitignore` cubre `.env*` pero las credenciales están en código fuente

### ✅ C-02: Path Traversal — CONFIRMADO

- `src/app/api/fs/read/route.js` línea 18: `path.resolve(basePath, userInput)` sin validación
- `src/app/api/fs/file/route.js` línea 30: mismo patrón
- `src/app/api/fs/tree/route.js` línea 48: mismo patrón

### ✅ C-03: DB Proxy sin auth — CONFIRMADO

- `src/app/api/db/query/route.js`: tiene allowlist de tablas (mejora parcial), pero campos se interpolan directo
- `src/app/api/db/mutate/route.js`: INSERT/UPDATE/DELETE en cualquier tabla sin auth

### ✅ C-04: 47 routes sin auth — CONFIRMADO (+1 desde el audit anterior)

### ✅ C-05: Shell commands — CONFIRMADO

9 rutas con `spawn`/`exec`/`execFile` sin sandbox ni rate limiting

### ✅ C-06: God Components — CONFIRMADO (actualizado)

| Componente                      | Líneas | Cambio             |
| ------------------------------- | ------ | ------------------ |
| `SwarmControl.jsx`              | 1707   | ↑ nuevo más grande |
| `AgentHub.jsx`                  | 1646   | ↑ (era ~1600)      |
| `Ajustes.jsx`                   | 1116   | Sin cambio         |
| `Tareas.jsx`                    | 999    | Sin cambio         |
| `Scaffolding.jsx`               | 802    | Sin cambio         |
| `ChatMessageList.jsx`           | 856    | ↑                  |
| `TerminalWorkspacesManager.jsx` | 749    | Sin cambio         |
| `ProjectHub.jsx`                | 708    | Sin cambio         |
| `Conexiones.jsx`                | 700    | Sin cambio         |

**Total: 9,283 líneas en 9 componentes.**

### ✅ C-07: Funciones duplicadas en localDb.js — CONFIRMADO

Líneas 540-612 y 614-690 son **copias exactas** de `insertMessage`, `getMessagesBySession`, `getToolTracesBySession`.

### ✅ C-08: `eval()` en ttyServer.js — CONFIRMADO

Líneas 8-9: `eval('require')('node-pty')` y `eval('require')('ws')`

### ✅ C-09: Hardcoded paths — PARCIALMENTE MEJORADO

- `resolveDbPath()` ahora tiene fallback candidates (mejora)
- PERO línea 14 aún tiene `/home/matias/devhub/data/devhub.db` como fallback
- `ttyServer.js` línea 157: `/home/matias/devhub/devhub-mcp/server.js` sigue hardcodeado

### ✅ C-10: Gemini API key en URL — CONFIRMADO

`src/app/api/ai/chat/route.js` línea 87: `?key=${apiKey}` en query string

---

## Nuevos Hallazgos (Delta)

### N-01: `sanitizeFtsQuery` duplicada verbatim

**Archivo:** `src/lib/db/localDb.js` líneas 472-478 y 486-492

**Problema:** La función `sanitizeFtsQuery` está definida dos veces con código idéntico. La segunda definición sobrescribe silenciosamente la primera.

**Impacto:** 16 líneas de código muerto. Indica copy-paste sin revisión.

**Riesgo:** 🟠 MEDIO (calidad)

---

### N-02: Índice de base de datos duplicado

**Archivo:** `src/lib/db/localDb.js` líneas 78-79

**Problema:**

```sql
CREATE INDEX IF NOT EXISTS idx_agent_hub_sessions_parent ON agent_hub_sessions(parent_id);
CREATE INDEX IF NOT EXISTS idx_agent_hub_sessions_parent ON agent_hub_sessions(parent_id);
```

Mismo índice creado dos veces consecutivas. SQLite lo ignora silenciosamente con `IF NOT EXISTS`, pero es código muerto y confusión.

**Riesgo:** 🟢 BAJO (cosmético)

---

### N-03: `use-toast.js` — listener leak potencial

**Archivo:** `src/hooks/use-toast.js` líneas 138-146

**Problema:**

```js
React.useEffect(() => {
  listeners.push(setState);
  return () => {
    const index = listeners.indexOf(setState);
    if (index > -1) {
      listeners.splice(index, 1);
    }
  };
}, [state]); // ← dependency en `state` = se re-suscribe cada cambio de estado
```

La dependencia `[state]` hace que el efecto se ejecute en CADA cambio de estado. Aunque el cleanup funciona, esto crea un patrón de unsubscribe/resubscribe innecesario. Debería ser `[]`.

**Riesgo:** 🟠 MEDIO (performance)

---

### N-04: `useAgentTraces` — triple-fetch confirmado

**Archivo:** `src/hooks/useAgentTraces.js`

**Problema:** Tres `useEffect` independientes disparan `fetchTraces`:

1. Línea 124-130: Initial fetch (deps: `sessionId`, `enabled`, `fetchTraces`)
2. Línea 133-141: Auto-refresh interval (deps: `sessionId`, `enabled`, `refreshInterval`, `fetchTraces`, `activeFilters`)
3. Línea 144-148: Filter change (deps: `activeFilters`, `fetchTraces`)

Cuando `activeFilters` cambia, se disparan el efecto #2 y #3 simultáneamente → doble fetch.

**Riesgo:** 🟠 MEDIO (performance, waste de recursos)

---

### N-05: `dangerouslySetInnerHTML` sin sanitización

**Archivos:**

- `src/components/chat/BashToolCard.jsx` línea 178
- `src/components/chat/utils/ansiToHtml.js` línea 236

**Problema:** Output de terminal se renderiza con `dangerouslySetInnerHTML`. La función `ansiToHtml` convierte ANSI a HTML pero no escapa contenido malicioso. Si un comando de shell produce output con tags HTML, se ejecutan.

**Ejemplo de ataque:** Un proceso que imprima `<img src=x onerror=alert(1)>` ejecutaría JavaScript.

**Riesgo:** 🔴 ALTO (XSS via terminal output)

---

### N-06: Fire-and-forget fetch sin manejo de errores

**Archivo:** `src/app/api/agenthub/headless/route.js` líneas 122-126

**Problema:**

```js
fetch(`${SERVER_URL}/session/${sessionID}/message`, {
  method: 'POST',
  // ...
}).catch((e) => console.error('Error enviando prompt a opencode', e));
```

El prompt se envía como fire-and-forget. Si falla, el cliente sigue esperando un stream que nunca llega. No hay timeout ni retry.

**Riesgo:** 🟠 MEDIO (reliability)

---

### N-07: `serverLaunchPromise` global sin cleanup en error

**Archivo:** `src/app/api/api/agenthub/headless/route.js` líneas 9, 22-66

**Problema:** `serverLaunchPromise` es un módulo-level singleton. Si el spawn falla, la promise se resuelve como `false` pero el proceso hijo de `opencode` queda huérfano. No hay cleanup del proceso en caso de error.

**Riesgo:** 🟠 MEDIO (resource leak)

---

### N-08: Agent spawn con `detached: true` sin tracking

**Archivo:** `src/app/api/agents/launch/route.js` línea 67-73

**Problema:**

```js
const child = spawn('opencode', ['--task', runtimeTask], {
  env: childEnv,
  detached: true,
  stdio: 'ignore',
});
child.unref();
```

El proceso se detach y se le hace unref. No hay forma de matarlo, monitorearlo, o saber si murió. Si el usuario lanza 50 agentes, hay 50 procesos huérfanos.

**Riesgo:** 🟠 MEDIO (resource leak, DoS)

---

### N-09: Copilot Adapter — `ERROR_TYPES.AUTH` y `ERROR_TYPES.UNKNOWN` no existen

**Archivo:** `telegram-bot/services/providers/copilot-adapter.js` líneas 375-377

**Problema:** `_mapError()` referencia `ERROR_TYPES.AUTH` y `ERROR_TYPES.UNKNOWN`. Si la `provider-interface.js` no define estas constantes (solo define `RATE_LIMIT`, `TIMEOUT`, `NETWORK`, `VALIDATION`), el código lanza un error diferente al original.

**Riesgo:** 🟠 MEDIO (error handling roto)

---

### N-10: Telegram Bot — `setInterval` de cleanup nunca se limpia

**Archivo:** `telegram-bot/bot.js` líneas 150-156

**Problema:**

```js
setInterval(() => {
  conversation.cleanupOldConversations();
}, 600_000);
```

El interval no se guarda en variable ni se limpia en `gracefulShutdown`. El bot no tiene un `clearInterval` en el shutdown.

**Riesgo:** 🟢 BAJO (el proceso muere de todos modos)

---

### N-11: 0 tests de integración reales para API routes

**Archivos:** `tests/unit/`, `tests/integration/`

**Problema:** Los "tests" unitarios re-implementan la lógica que deberían testear. `session-bridge.test.js` y `trace-api.test.js` crean handlers inline que duplican el código de las routes reales. Si la route cambia y el test no, el test sigue pasando pero la route está rota.

Los tests de integración (`sse-reconnect.test.js`, `telegram-opencode.test.js`) y E2E (Playwright specs) existen pero no se ejecutan en CI.

**Riesgo:** 🟠 MEDIO (falsa confianza en tests)

---

### N-12: ESLint ignora telegram-bot y devhub-mcp

**Archivo:** `eslint.config.js` líneas 57-59

**Problema:**

```js
ignores: [
  'telegram-bot/**',
  'devhub-mcp/**',
  // ...
];
```

Todo el código del Telegram Bot (~30 archivos) y el MCP server están completamente fuera del linting. Esto explica por qué el auth bypass (M-16) y el error classification roto (M-17) pasaron desapercibidos.

**Riesgo:** 🟠 MEDIO (calidad invisible)

---

## Problemas Persisten Sin Cambio

| ID   | Problema                                   | Estado     |
| ---- | ------------------------------------------ | ---------- |
| M-01 | 20+ duplicaciones de lógica                | Sin cambio |
| M-02 | 0 capa de servicio                         | Sin cambio |
| M-03 | Múltiples conexiones DB concurrentes       | Sin cambio |
| M-04 | Global state mutation sin cleanup          | Sin cambio |
| M-05 | Memory leaks en useEffect                  | Sin cambio |
| M-07 | CSP deshabilitado en Tauri                 | Sin cambio |
| M-08 | 60+ magic numbers                          | Sin cambio |
| M-09 | 0 validación de props                      | Sin cambio |
| M-10 | Inline styles vs Tailwind inconsistente    | Sin cambio |
| M-11 | Re-renders innecesarios masivos            | Sin cambio |
| M-13 | tailwind.config.js dead code (Tailwind v4) | Sin cambio |
| M-14 | Dead code: index.js, proxy.ts              | Sin cambio |
| M-15 | opencode/ vendored con .git propio         | Sin cambio |
| M-16 | Auth bypass ALLOWED_USER_IDS vacío         | Sin cambio |
| M-17 | Copilot error classification rota          | Sin cambio |
| M-18 | Inconsistencia de idiomas                  | Sin cambio |
| M-19 | ESLint plugins no utilizados               | Sin cambio |
| M-20 | SQL injection en buildSelectQuery          | Sin cambio |

---

## Priorización Actualizada

### 🔴 Inmediato (esta semana)

1. **Rotar credenciales expuestas** (C-01, C-10) — Supabase keys en `next.config.js`, Gemini key en URL
2. **Fix path traversal** en `/api/fs/*` (C-02) — 2h
3. **Proteger `/api/db/*`** (C-03, C-04) — Agregar auth middleware
4. **Eliminar eval()** de `ttyServer.js` (C-08) — 1h
5. **Sanitizar `dangerouslySetInnerHTML`** en BashToolCard/ansiToHtml (N-05) — 2h

### 🟠 Corto plazo (2-3 semanas)

6. Eliminar duplicados en `localDb.js` (C-07, N-01, N-02) — 1h
7. Fix Copilot error classification (M-17, N-09) — 2h
8. Fix use-toast listener leak (N-03) — 30min
9. Fix triple-fetch en useAgentTraces (N-04, M-06) — 1h
10. Agregar telegram-bot al ESLint (N-12) — 1h
11. Hardcoded paths → env vars (C-09) — 2h
12. Process cleanup para detached spawns (N-07, N-08) — 2h

### 🟡 Mediano plazo (4-8 semanas)

13. Descomponer God Components (C-06) — mayor esfuerzo
14. Crear capa de servicios (M-02)
15. Agregar autenticación a todas las routes (C-04)
16. Fix memory leaks (M-05)
17. Unificar query builders (M-01)

---

## Conclusión

El codebase de DevHub es **funcional pero frágil**. Los problemas de seguridad son el riesgo más inmediato — especialmente las credenciales expuestas y las routes sin auth. La deuda técnica arquitectónica (God Components, 0 service layer) hace que cualquier refactor sea costoso.

**Recomendación:** Seguir la priorización del reporte original con la adición de los hallazgos N-05 (XSS), N-09 (error handling roto), y N-12 (ESLint ciego) como prioridades altas.
