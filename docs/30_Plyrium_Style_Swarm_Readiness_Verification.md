# Verificación de readiness — DevHub Swarm estilo Plyrium

> **Estado:** No listo para prueba real completa.  
> **Fecha:** 2026-05-24  
> **Alcance:** Validación posterior a los fixes de worktrees, wrapper, cwd guard, heartbeat, events y write queue.  
> **Documento padre:** [`28_Plyrium_Architecture_Analysis_and_Plan.md`](./28_Plyrium_Architecture_Analysis_and_Plan.md)  
> **Backlog:** [`29_Plyrium_Style_Swarm_Implementation_Tasks.md`](./29_Plyrium_Style_Swarm_Implementation_Tasks.md)

---

## 1. Veredicto ejecutivo

El desarrollo avanzó y varios bloqueos iniciales fueron corregidos parcialmente, pero **todavía no conviene lanzar una prueba real de 5 agentes**.

La razón principal es que el flujo `launch_swarm_local` todavía falla en tests relevantes con:

```text
FOREIGN KEY constraint failed
```

dentro de `DbWriteQueue`.

Además quedan inconsistencias de metadata/runtime:

- el prompt y `agent_hub_sessions.directory` todavía pueden apuntar al repo raíz en vez del worktree por rol;
- el TTY todavía no recibe un flag explícito de “esto es swarm”, por lo que no puede rechazar todos los fallbacks peligrosos;
- ESLint falla en archivos críticos nuevos.

**Conclusión:** estado actual = **parcialmente corregido, bloqueado para prueba real completa**.

---

## 2. Qué se verificó

### Archivos críticos revisados

| Área | Archivo | Estado |
|------|---------|--------|
| Launch local | `src/app/api/agenthub/operations/health/route.js` | Parcialmente corregido, aún falla test de launch. |
| Worktree manager | `src/lib/swarm/agentWorkspaceManager.js` | Tests focalizados pasan. |
| Launch wrapper | `src/lib/agentLaunchWrapper.js` | Conectado al launch, pero con lint pendiente. |
| CWD guard | `src/lib/terminal/cwdGuard.js` | Tests pasan, pero integración TTY aún insuficiente. |
| TTY server | `src/lib/terminal/ttyServer.js` | Valida `.devhub/worktrees`, pero no recibe flag explícito swarm. |
| Heartbeat | `src/app/api/agenthub/presence/heartbeat/route.js` | Mejorado: rechaza cwd fuera de `.devhub/worktrees`. |
| Events | `src/app/api/agenthub/events/route.js` | Usa write queue. |
| Write queue | `src/lib/db/writeQueue.js` | Integrado, pero probablemente con mismatch de DB/contexto. |
| Diagnóstico | `scripts/diagnose-swarm-runtime.mjs` | Corre correctamente. |

---

## 3. Fixes que sí aparecen aplicados

### 3.1 Wrapper conectado al launch

Antes el wrapper existía pero no se usaba. Ahora `operations/health/route.js` importa:

```js
import { buildAgentLaunchWrapper } from '@/lib/agentLaunchWrapper';
```

y `buildLaunchCommand()` devuelve:

```js
return buildAgentLaunchWrapper({
  agentId: `${launchId}-${roleKey}`,
  missionId: launchId,
  role: roleKey,
  workspacePath,
  innerCommand,
});
```

**Estado:** corregido funcionalmente, con lint pendiente en `agentLaunchWrapper.js`.

### 3.2 Write queue integrado en rutas críticas

Ahora se usa `withDbWriteQueue` en:

- `launchSwarmLocal`
- `presence/heartbeat`
- `events`

**Estado:** integrado, pero aún falla el test de launch con FK constraint.

### 3.3 Heartbeat rechaza cwd inválido

Ahora `presence/heartbeat` rechaza paths fuera de `.devhub/worktrees`:

```js
if (cwd && !cwd.includes('.devhub/worktrees')) {
  return NextResponse.json(
    { error: `cwd must be under .devhub/worktrees for swarm heartbeats: ${cwd}` },
    { status: 400 }
  );
}
```

**Estado:** corregido.

### 3.4 `worktree_path` intenta conservar path real

`activatePreparedWorkspace()` ahora usa:

```js
workspacePath.includes('.devhub/worktrees')
  ? workspacePath
  : `${workspacePath}/.worktrees/${branchName}`
```

Como el caller le pasa `worktreePath`, evita el bug anterior de duplicar `.worktrees/...` en ese caso.

**Estado:** mitigado. Aun así conviene simplificarlo para que `activatePreparedWorkspace()` reciba explícitamente `worktreePath` y no derive paths.

---

## 4. Bloqueos que siguen abiertos

### Bloqueo 1 — `launch_swarm_local` falla con FK constraint

Comando ejecutado:

```bash
npm test -- \
  src/lib/swarm/__tests__/agentWorkspaceManager.test.js \
  src/lib/__tests__/agentLaunchWrapper.test.js \
  src/lib/terminal/__tests__/cwdGuard.test.js \
  src/app/api/agenthub/operations/health/route.integration.test.js \
  tests/agenthub/api/operations-health.test.js \
  --runInBand
```

Resultado:

```text
Test Suites: 1 failed, 4 passed, 5 total
Tests:       3 failed, 60 passed, 63 total
```

Fallo crítico:

```text
[DbWriteQueue] Error: swarm-launch — FOREIGN KEY constraint failed
[operations/health][POST] Error: FOREIGN KEY constraint failed
```

Impacto:

- No podemos afirmar que el launch local cree misión, workspaces, runs y sessions correctamente.
- Si esto pasa en real, el usuario verá un error 500 al lanzar swarm.

Hipótesis probable:

- `src/lib/db/writeQueue.js` importa `getDb` desde `./core`:

```js
const { getDb } = require('./core');
```

- Pero `operations/health/route.js` y sus domain helpers vienen desde `localDb.js`.
- Esto puede crear mismatch de singleton/contexto DB, especialmente en tests con fixtures.

Acción recomendada:

- Hacer que `writeQueue` use el mismo `getDb` que `localDb.js`, o que acepte DB inyectado.
- Rerun obligatorio de `tests/agenthub/api/operations-health.test.js`.

### Bloqueo 2 — Prompt y session directory todavía pueden apuntar al repo raíz

En `launchSwarmLocal`, el prompt todavía se arma con:

```js
workspacePath: resolvedDraft.workspacePath
```

Y la sesión se registra con:

```js
directory: resolvedDraft.workspacePath
```

Pero para un rol concreto debería usarse:

```js
workspacePath: worktreePath
```

y:

```js
directory: worktreePath
```

Impacto:

- El agente puede leer en el prompt “Workspace: repo raíz” aunque el runtime tenga un worktree.
- `agent_hub_sessions` puede mostrar un directorio que no coincide con el cwd real.
- Esto puede reintroducir confusión operacional.

Acción recomendada:

- Mover construcción del prompt después de `prepareAgentWorktree()`.
- Usar `worktreePath` en prompt, session directory y runtime metadata.

### Bloqueo 3 — TTY no recibe flag explícito de swarm

El TTY valida así:

```js
isSwarmRole: isDevHubWorktreePath(resolvedCwd)
```

Eso valida bien si el cwd ya es `.devhub/worktrees`, pero no detecta el caso peligroso:

1. un runtime request era swarm;
2. falta `workspacePath` por bug;
3. el terminal cae al repo raíz;
4. `isDevHubWorktreePath(repoRoot) === false`;
5. la validación no lo trata como swarm.

Impacto:

- Todavía puede existir fallback silencioso al repo raíz si no se propaga `workspacePath`.

Acción recomendada:

- Propagar un flag explícito desde runtime request/panel/WS:

```text
isSwarmRole=true
roleKey=coder
launchId=launch-xxxx
```

- Si `isSwarmRole=true`, exigir cwd bajo `.devhub/worktrees` aunque el cwd recibido sea repo raíz.

### Bloqueo 4 — ESLint falla en archivos críticos

Comando ejecutado:

```bash
./node_modules/.bin/eslint \
  src/app/api/agenthub/operations/health/route.js \
  src/app/api/agenthub/presence/heartbeat/route.js \
  src/app/api/agenthub/events/route.js \
  src/lib/terminal/ttyServer.js \
  src/lib/terminal/cwdGuard.js \
  src/lib/agentLaunchWrapper.js \
  src/lib/db/writeQueue.js \
  --quiet
```

Resultado:

```text
16 problems (16 errors, 0 warnings)
```

Errores principales:

- `src/lib/agentLaunchWrapper.js`
  - múltiples `no-useless-escape`
  - `module is not defined`
- `src/lib/terminal/cwdGuard.js`
  - `repoRoot is defined but never used`

Impacto:

- No pasa quality gate mínimo en archivos tocados.

Acción recomendada:

- Limpiar escapes innecesarios en el string del trap.
- Ajustar export/CommonJS o config según convención del repo.
- Usar o remover `repoRoot` en `cwdGuard`.

---

## 5. Evidencia de comandos

### 5.1 Tests focalizados + operations health

```bash
npm test -- \
  src/lib/swarm/__tests__/agentWorkspaceManager.test.js \
  src/lib/__tests__/agentLaunchWrapper.test.js \
  src/lib/terminal/__tests__/cwdGuard.test.js \
  src/app/api/agenthub/operations/health/route.integration.test.js \
  tests/agenthub/api/operations-health.test.js \
  --runInBand
```

Resultado resumido:

```text
PASS src/app/api/agenthub/operations/health/route.integration.test.js
PASS src/lib/swarm/__tests__/agentWorkspaceManager.test.js
PASS src/lib/__tests__/agentLaunchWrapper.test.js
PASS src/lib/terminal/__tests__/cwdGuard.test.js
FAIL tests/agenthub/api/operations-health.test.js

Test Suites: 1 failed, 4 passed, 5 total
Tests:       3 failed, 60 passed, 63 total
```

### 5.2 Diagnóstico runtime

```bash
node scripts/diagnose-swarm-runtime.mjs
```

Resultado relevante:

```text
node: v24.14.0
better-sqlite3: 12.8.0
PRAGMA journal_mode: wal
PRAGMA foreign_keys: 1
PRAGMA busy_timeout: 5000
node/opencode/tmux/codex/hermes: 0
Git Worktrees: 0
```

### 5.3 ESLint focalizado

```bash
./node_modules/.bin/eslint <critical-files> --quiet
```

Resultado:

```text
16 errors
```

---

## 6. Checklist para declarar “listo para prueba real”

No lanzar prueba real de 5 agentes hasta que esto esté en verde:

- [ ] `launch_swarm_local` devuelve `200` en `tests/agenthub/api/operations-health.test.js`.
- [ ] No hay `FOREIGN KEY constraint failed` en `DbWriteQueue`.
- [ ] `writeQueue` usa el mismo DB/contexto que los domain helpers o acepta DB inyectado.
- [ ] `buildLaunchPrompt()` recibe `worktreePath` por rol.
- [ ] `agent_hub_sessions.directory` se guarda como `worktreePath` por rol.
- [ ] Runtime request mantiene `workspacePath = worktreePath`.
- [ ] TTY/WS recibe `isSwarmRole=true` explícito para swarms.
- [ ] Si `isSwarmRole=true` y cwd no está bajo `.devhub/worktrees`, el terminal aborta.
- [ ] Heartbeat rechaza `.plyrium-forge` y cualquier cwd fuera de `.devhub/worktrees`.
- [ ] ESLint focalizado pasa en archivos críticos.
- [ ] Tests focalizados + `operations-health.test.js` pasan.

---

## 7. Orden recomendado de fixes

1. **Arreglar `writeQueue` / DB context mismatch.**
   - Prioridad máxima porque hoy rompe el launch.
2. **Cambiar prompt y session directory a `worktreePath`.**
   - Evita inconsistencias de runtime y confusión del agente.
3. **Agregar flag explícito de swarm al TTY/WS.**
   - Cierra el fallback silencioso al repo raíz.
4. **Corregir lint de archivos críticos.**
   - Necesario para quality gate.
5. **Rerun de tests focalizados.**
6. **Recién después: prueba manual pequeña.**

---

## 8. Plan de prueba manual después de desbloquear

Cuando el checklist anterior esté en verde:

### Prueba A — 1 agente

- Lanzar swarm mínimo o rol único.
- Confirmar en terminal:

```bash
pwd
```

Debe estar bajo:

```text
.devhub/worktrees/<launch-id>/<role>
```

### Prueba B — 5 agentes

Validar:

- cada rol tiene worktree distinto;
- cada rol tiene branch distinto;
- ningún rol arranca en repo raíz;
- heartbeats llegan;
- events aparecen;
- Control Room no muestra estado falso;
- no aparecen procesos huérfanos tras cerrar.

### Prueba C — restart/reconcile

- Reiniciar UI/server.
- Confirmar que supervisor snapshot reconstruye:
  - active missions;
  - presence/stale;
  - worktrees;
  - tmux sessions;
  - anomalies.

---

## 9. Veredicto actual

| Criterio | Estado |
|----------|--------|
| Worktree manager | Parcialmente listo |
| Wrapper conectado | Parcialmente listo |
| Heartbeat cwd guard | Listo a nivel básico |
| Events write queue | Parcialmente listo |
| Launch local completo | **Bloqueado** |
| Tests relevantes | **Fallan** |
| Lint archivos críticos | **Falla** |
| Prueba real 5 agentes | **No recomendado todavía** |

**Veredicto final:** no está completamente corregido. Requiere una ronda corta de fixes antes de probar en real.
