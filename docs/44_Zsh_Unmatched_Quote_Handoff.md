# Handoff: Error `zsh:44: unmatched '` en Lanzamiento de Swarm

> **Fecha:** 2026-05-29
> **Contexto:** Proyecto DevHub — Swarm ↔ SDD Integration
> **Rama:** `feature/session-workspace-restore`
> **Commit más reciente del fix intentado:** `72e192b`
> **Estado:** NO resuelto. Necesita investigación adicional.

---

## Actualización de esta sesión

**Resultado breve:** en esta sesión se corrigió el bug de `opencode --session` inválido y se mitigó el problema de perfiles visibles del swarm, pero el arranque todavía NO quedó resuelto del todo porque el prompt inicial sigue dependiendo de timing.

### Cambios aplicados en esta sesión

| Archivo                                    | Cambio aplicado                                                                                                                         | Motivo / conclusión                                                                                                                                    |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/lib/agentLaunchCommand.js`            | `sddEnabled` pasó a ser opt-in real (`options.sddEnabled === true`)                                                                     | El launcher estaba heredando desde env una sesión interna UUID de DevHub y la pasaba a `opencode --session`; OpenCode solo acepta IDs runtime `ses_*`. |
| `src/lib/agentLaunchCommand.js`            | Se agregaron `disableTmuxWrap` e `interactiveBootstrapPrompt`                                                                           | El swarm visible corre sobre una terminal que ya está tmux-backed y OpenCode debía poder arrancar sin `--prompt` para bootstrap posterior.             |
| `src/lib/agentLaunchWrapper.js`            | Se agregó `bootstrapPrompt` con pegado por tmux y la espera subió de `sleep 1` a `sleep 3`                                              | Mitigación para que el primer prompt no se pierda mientras OpenCode sigue en splash/startup. Sigue siendo una solución por timing.                     |
| `src/lib/__tests__/agentLaunchCwd.test.js` | Se agregaron regresiones para `disableTmuxWrap`, `interactiveBootstrapPrompt`, no heredar `SDD_ENABLED`, y wrapper con bootstrap prompt | Blindar el contrato del launcher y el wrapper contra regresiones del bug visto en vivo.                                                                |
| `opencode.json`                            | Se definieron agentes locales `swarm-*` como `primary` y `hidden: false`, apuntando a prompts del repo                                  | El config global activo tenía varios workers visibles como `subagent` ocultos; eso explicaba el `agent not found` en coder/devops/architect/auditor.   |
| `src/lib/__tests__/opencodeConfig.test.js` | Test nuevo para validar el contrato del `opencode.json` local                                                                           | Mantener estable la mitigación de perfiles visibles.                                                                                                   |

### Validación ejecutada en esta sesión

- Comando: `CI=1 TERM=dumb npx jest src/lib/__tests__/agentLaunchCwd.test.js src/lib/__tests__/opencodeConfig.test.js --runInBand --colors=false`
- Resultado: `20/20` tests pasando.

### Aclaraciones importantes para continuación

- `devhub-mcp/server.js` NO recibió cambios de lógica runtime en esta sesión. Solo tuvo una nota temporal de continuidad y se mueve a este handoff para no mezclar documentación con código del MCP.
- `opencode.json` sí fue modificado en esta sesión, pero está ignorado por Git (`.gitignore:95`), por eso no aparece en `git status` normal.
- El problema original de `zsh:44: unmatched '` sigue documentado abajo y NO debe considerarse cerrado solo porque el bug de sesión inválida quedó corregido.

### Punto exacto donde continuar

- Reemplazar el bootstrap por timing con inyección por readiness después de `devhub:opencode-session-detected`.
- Archivos probables para ese seguimiento:
- `src/components/TerminalWorkspacesManager.jsx`
- `src/components/TerminalTTY.jsx`
- `src/app/api/agenthub/operations/health/route.js`

---

## 1. Descripción del Error

Al lanzar un swarm desde DevHub, **TODAS** las terminales de agentes muestran:

```
zsh:44: unmatched '
```

El agente nunca arranca porque el shell zsh interactivo falla al parsear el comando inicial.

**Nota del usuario (último reporte):** "ahora de hecho tiene un espacio entremedio antes había como un matchet y una comilla simple, ahora hay un espacio entre la palabra un matchet y la comilla simple"

Esto sugiere que la naturaleza del error cambió ligeramente pero persiste — sigue siendo un problema de quoting de comillas simples.

---

## 2. Arquitectura del Flujo de Lanzamiento

```
Usuario click "Lanzar Swarm"
  ↓
SwarmLaunchWizardModal → createSwarmLaunchDraft() → resolvedDraft
  ↓
launchSwarmLocal({ projectId, draft })
  ↓ (health/route.js:1053)
  - Crea mission, worktrees, sessions, workspaces, runs
  - Para cada roleEntry:
    ↓
    configureLaunchRole() (health/route.js:881)
      ↓
      prepareAgentWorktree() → worktreePath, branchName, observedHead
      ↓
      buildLaunchPrompt() → prompt (texto plano)
      ↓
      buildLaunchCommand() (health/route.js:138)
        ├─ buildAgentLaunchCommand() (agentLaunchCommand.js:94)
        │   ├─ buildSddPrompt() (opcional, cuando sddEnabled=true)
        │   │   └─ buildPrompt() de SwarmPromptEngine.js
        │   ├─ shellQuotePrompt() (docopsPrompts.js — JSON.stringify)
        │   └─ Construye: opencode --agent swarm-director --prompt "..." --model ...
        │
        └─ buildAgentLaunchWrapper() (agentLaunchWrapper.js:186)
            ├─ pathValidationBlock (if [ ! -d "path" ])
            ├─ cdBlock (cd "path" || { ... })
            ├─ buildAgentEnvExports() (exports de env vars)
            ├─ buildIdentityVerificationBlock() (echo DEVHUB_AGENT_ID=...)
            ├─ buildInitialHeartbeatCommand() (curl con HMAC — **PRINCIPAL SOSPECHOSO**)
            ├─ buildExitTrapCommand() (trap EXIT con curl — **ANTERIOR SOSPECHOSO**)
            └─ innerCommand (opencode/codex/hermes)
      ↓
      runtimeRequest: { command, commandPreview, ... }
  ↓
  runtimeRequests → kickoffMessage → frontend vía WebSocket/SSE
  ↓
  TerminalWorkspacesManager.jsx: createWorkspaceForSwarmLaunchRequests()
    └─ createPanel(panelId, request.commandToRun, ...)
  ↓
  TerminalTTY.jsx:1610
    └─ socket.send(cleanCommand + '\r')  ← Se "tipea" en zsh interactivo
```

**Punto crítico:** El wrapper es un script multilínea de ~70 líneas que se envía como un solo string a un zsh interactivo vía PTY. NO se ejecuta como archivo bash (`bash script.sh`) — se "tipea" línea por línea en un shell interactivo.

---

## 3. Fixes Intentados (y su resultado)

### Fix 1: `buildExitTrapCommand` — Inline trap con awk (commit e83e367)

**Problema original:** `buildExitTrapCommand` generaba:

```bash
trap 'local PAYLOAD="{...}"; local BODY_HASH=$(printf '%s' "$PAYLOAD" | awk '{print $NF}')' EXIT
```

La comilla simple de `awk '{print $NF}'` cerraba prematuramente la string single-quoted del trap.

**Fix aplicado:** Reemplazó el inline trap por una función bash:

```bash
_devhub_exit_handler() {
  local EXIT_CODE=$?
  local TIMESTAMP=...
  local PAYLOAD="..."
  local BODY_HASH=$(printf '%s' "$PAYLOAD" | openssl dgst -sha256 | awk '{print $NF}')
  ...
}
trap _devhub_exit_handler EXIT
```

**Resultado:** Error cambió de forma pero persiste. El usuario reporta "un espacio entre la palabra y la comilla simple".

**Archivo:** `src/lib/agentLaunchWrapper.js:150-169`
**Estado:** ✅ Fix aplicado, verificado que la función usa comillas balanceadas.

---

### Fix 2: `buildInitialHeartbeatCommand` — Escaping de single quotes en payload (commit 72e192b)

**Problema identificado:** `HEARTBEAT_PAYLOAD='${payload}'` no escapaba comillas simples dentro del payload JSON. Si `workspacePath`, `role`, `agentId` o `missionId` contenía `'`, el assignment bash se rompía:

```bash
HEARTBEAT_PAYLOAD='{"role":"dev's-assistant"}'  # ← ' de "dev's" cierra el string
```

**Fix aplicado:**

```javascript
const escapedPayload = payload.replace(/'/g, "'\\''");
return `HEARTBEAT_PAYLOAD='${escapedPayload}'
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
...`;
```

Esto transforma `'` en `'\''` (cerrar quote, escapar quote, reabrir quote), que es la forma estándar de bash.

**Tests agregados:** 3 tests nuevos en `agentLaunchCwd.test.js`:

1. `workspacePath` con single quote
2. `role` con single quote
3. Validación `bash -n` del wrapper completo con single quotes

**Resultado:** 34 tests pasan (incluyendo los nuevos). **PERO el usuario reporta que el error persiste.**

**Archivo:** `src/lib/agentLaunchWrapper.js:127-142`
**Tests:** `src/lib/__tests__/agentLaunchCwd.test.js:110-153`
**Estado:** ✅ Fix aplicado, tests pasan, pero el error en vivo persiste.

---

## 4. Estado Actual del Código (Líneas Clave)

### 4.1 `agentLaunchWrapper.js`

```javascript
// Líneas 127-142: buildInitialHeartbeatCommand
// Escape single quotes for safe embedding in single-quoted shell variable.
const escapedPayload = payload.replace(/'/g, "'\\''");

return `HEARTBEAT_PAYLOAD='${escapedPayload}'
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
BODY_HASH=$(printf '%s' "$HEARTBEAT_PAYLOAD" | openssl dgst -sha256 | awk '{print $NF}')
SIGNATURE=$(printf '%s' "\${TIMESTAMP}.\${BODY_HASH}" | openssl dgst -sha256 -hmac "$DEVHUB_AGENT_TOKEN" | awk '{print $NF}')
curl -s -X POST "${supervisorUrl}/api/agenthub/presence/heartbeat" \\
  -H "Content-Type: application/json" \\
  -H "X-Agent-Id: ${agentId}" \\
  -H "X-Agent-Timestamp: \${TIMESTAMP}" \\
  -H "X-Agent-Signature: \${SIGNATURE}" \\
  -d "$HEARTBEAT_PAYLOAD" > /dev/null 2>&1 || true`;
```

**Nota:** Las líneas con `awk '{print $NF}'` usan comillas simples, pero están dentro de un command substitution `$()` que NO está dentro de comillas simples. Esto es válido bash.

### 4.2 `buildAgentLaunchWrapper` (líneas 186-256)

Genera un script con:

1. `#!/usr/bin/env bash` (shebang)
2. `if [ ! -d "${workspacePath}" ]; then` (path validation)
3. `cd "${workspacePath}" || { ... }` (cd con fallback)
4. Exports de env vars (con comillas dobles)
5. Identity verification (echo statements)
6. Heartbeat command (el que se fixeó)
7. Exit trap (el que se fixeó)
8. `innerCommand` (opencode/codex/hermes)

**Problema potencial:** Este script de ~70 líneas se envía como un string a un zsh interactivo. El shebang (`#!/usr/bin/env bash`) NO tiene efecto en un shell interactivo — zsh intentará parsear cada línea con sus propias reglas.

### 4.3 `agentLaunchCommand.js` — Quoting Chain

```javascript
// shellQuotePrompt usa JSON.stringify (comillas dobles)
function shellQuotePrompt(prompt) { ... }

// shellQuote envuelve en comillas simples y escapa ' como '"'"'
function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'"'"'`)}'`;
}

// innerCommand para opencode:
// opencode --agent swarm-director --prompt "prompt-text-quotizado" --model modelId

// Luego buildTmuxWrappedCommand:
// tmux new-session -A -d -s 'session-name' -c '/cwd' 'opencode --agent ... --prompt "..."'
```

El `innerCommand` ya está escapado correctamente para single quotes.

### 4.4 `TerminalTTY.jsx:1610-1619`

```javascript
if (initialCommand && !hasSentInitialCommand.current) {
  const cleanCommand = initialCommand.replace(/\s*#recovery-\d+\s*$/, '');
  console.log(`[TTY:${id}] Sending initial command: ${cleanCommand}`);
  if (transportRef.current === 'raw') {
    socket.send(cleanCommand + '\r');
  } else {
    socket.send(JSON.stringify({ type: 'input', data: cleanCommand + '\r' }));
  }
  hasSentInitialCommand.current = true;
}
```

El `cleanCommand` es el wrapper completo de ~70 líneas. Se envía como un string + `\r` al PTY.

---

## 5. Hipótesis Actuales (ordenadas por probabilidad)

### Hipótesis A: El script multilínea NO debe enviarse directamente a zsh interactivo

**Razonamiento:**

- El wrapper es un script bash completo con shebang, comentarios, bloques multilínea
- Se envía a un zsh interactivo que NO ejecuta archivos — interpreta línea por línea
- zsh puede interpretar backslashes de continuación de línea (`\` al final de línea) diferente a bash
- El shebang `#!/usr/bin/env bash` es ignorado en modo interactivo

**Prueba propuesta:**
En lugar de enviar el script completo como string al PTY, envolverlo en un archivo temporal:

```bash
/tmp/devhub-wrapper-XXXX.sh << 'WRAPPER_EOF'
[script completo]
WRAPPER_EOF
bash /tmp/devhub-wrapper-XXXX.sh
```

O usar `eval` o `bash -c` con el script como here-document.

**Archivos a modificar:** `TerminalTTY.jsx` o `agentLaunchWrapper.js`

---

### Hipótesis B: `buildIdentityVerificationBlock` tiene comillas simples desbalanceadas

**Razonamiento:**

- `buildIdentityVerificationBlock` (líneas 81-99) contiene:

```bash
echo "DEVHUB_AGENT_ID=${agentId}"
echo "Current directory: $(pwd)"
```

- Si `agentId` o `workspacePath` contienen comillas simples, los `echo` con dobles quotes no se rompen (las dobles quotes permiten `'` literalmente)
- PERO la línea 92:

```bash
if [ "$(pwd)" != "${workspacePath}" ]; then
```

Si `workspacePath` contiene `'`, la comparación `"..." != "..."` con dobles quotes debería ser segura.

**Veredicto:** Poco probable, pero verificar si `workspacePath` real contiene apóstrofos.

---

### Hipótesis C: El prompt contiene comillas simples que rompen la cadena

**Razonamiento:**

- `buildLaunchPrompt` (health/route.js:108-136) genera un prompt en español
- Contiene líneas como: `Rol: ${role}`, `Workspace: ${workspacePath}`, `Misión: ${mission}`
- El prompt se quotiza con `shellQuotePrompt()` que usa `JSON.stringify` → comillas dobles
- Luego se pasa a `buildAgentLaunchCommand` que construye:
  `opencode --agent swarm-director --prompt "prompt-con-comillas-dobles"`
- Si el prompt del usuario (`mission`) contiene `"`, `JSON.stringify` las escapa como `\"`
- Si contiene `'`, `JSON.stringify` las deja como `'` (dentro de comillas dobles, es válido)
- Luego `shellQuote()` (de `buildTmuxWrappedCommand`) envuelve TODO en comillas simples y escapa `'` como `'"'"'`

**Veredicto:** El quoting chain parece correcto. PERO si el prompt es muy largo (>4096 chars en algunos shells), podría truncarse y dejar quotes desbalanceadas.

**Nota:** `buildSddPrompt` (cuando SDD está activado) usa `buildPrompt` de `SwarmPromptEngine.js` que genera prompts extensos con secciones "Phase Contract", "Context Budget", etc. Si SDD está habilitado, el prompt es MUCHO más largo.

---

### Hipótesis D: `buildAgentEnvExports` con `supervisorUrl` que contiene `'`

**Razonamiento:**

```javascript
exports.push(`export DEVHUB_SUPERVISOR_URL="${supervisorUrl}"`);
```

Si `supervisorUrl` contiene `'`, las comillas dobles lo protegen. Poco probable.

---

### Hipótesis E: `awk '{print $NF}'` en zsh interactivo causa problemas

**Razonamiento:**

- Aunque el fix del trap reemplazó el inline trap por una función, todavía hay `awk '{print $NF}'` en:
  - `buildInitialHeartbeatCommand`: `awk '{print $NF}'` (líneas 134-135)
  - `buildExitTrapCommand`: `awk '{print $NF}'` (líneas 159-160)
- En un script bash ejecutado como archivo, `$()` con `awk '{print $NF}'` es válido
- PERO en un zsh interactivo que recibe líneas una por una, ¿podría zsh estar interpretando `'` antes de que el `$()` se cierre?

**Veredicto:** Posible, pero `bash -n` valida el script como archivo. El problema es el modo de ejecución (interactivo vs archivo).

---

### Hipótesis F: Problema de backslash de continuación de línea

**Razonamiento:**

- El wrapper contiene líneas con `\` al final para continuar en la siguiente línea (ej: el comando curl)

```bash
curl -s -X POST "..." \
  -H "Content-Type: application/json" \
  ...
```

- En bash interactivo, `\` al final de línea indica continuación
- En zsh interactivo, el comportamiento es similar PERO si hay espacios después del `\`, puede fallar
- El usuario mencionó "un espacio entre la palabra y la comilla simple"

**Veredicto:** MUY PROBABLE. El backslash de continuación seguido de espacio podría estar causando que zsh interprete la siguiente línea como un comando separado, y cuando esa línea contiene `awk '{print $NF}'`, zsh ve una comilla simple desbalanceada en un contexto donde NO es parte de un `$()`.

---

## 6. Datos que Faltan para Diagnosticar

Para el siguiente agente, NECESITA obtener:

### 6.1 Log del comando exacto enviado al PTY

Agregar logging en `TerminalTTY.jsx:1613`:

```javascript
console.log(`[TTY:${id}] RAW initialCommand length: ${cleanCommand.length}`);
console.log(`[TTY:${id}] RAW initialCommand first 500 chars: ${cleanCommand.slice(0, 500)}`);
console.log(`[TTY:${id}] RAW initialCommand contains single quotes: ${cleanCommand.includes("'")}`);
console.log(
  `[TTY:${id}] RAW initialCommand single quote count: ${(cleanCommand.match(/'/g) || []).length}`
);
```

### 6.2 Log en el backend del wrapper generado

Agregar logging en `configureLaunchRole` (health/route.js:~1018):

```javascript
console.log(`[SWARM_LAUNCH] Generated wrapper for ${roleKey}, length: ${command.length}`);
console.log(`[SWARM_LAUNCH] Wrapper contains single quotes: ${command.includes("'")}`);
```

### 6.3 Capturar el payload JSON real

Verificar qué valores tienen `agentId`, `missionId`, `role`, `workspacePath` en un lanzamiento real:

```javascript
console.log(`[SWARM_LAUNCH] Payload fields:`, {
  agentId: `${launchId}-${roleKey}`,
  missionId: launchId,
  role: roleKey,
  workspacePath: worktreePath,
});
```

### 6.4 Verificar si el error ocurre en bash también

Cambiar temporalmente el shell del PTY de `zsh` a `bash` para ver si es específico de zsh.

---

## 7. Próximos Pasos Recomendados

### Paso 1: Agregar logging exhaustivo

Agregar logs en:

- `TerminalTTY.jsx:1613` — comando exacto enviado al PTY
- `health/route.js:configureLaunchRole` — wrapper generado
- `agentLaunchWrapper.js:buildAgentLaunchWrapper` — antes de retornar

### Paso 2: Probar Hipótesis A (modo de ejecución)

En lugar de enviar el script multilínea directamente al PTY, probar:

**Opción A:** Escribir el wrapper a un archivo temporal y ejecutarlo:

```javascript
// En el backend, antes de enviar al frontend
const wrapperScript = buildAgentLaunchWrapper({...});
const wrapperPath = `/tmp/devhub-wrapper-${agentId}.sh`;
fs.writeFileSync(wrapperPath, wrapperScript);
const commandToRun = `bash ${wrapperPath}`;
```

**Opción B:** Usar `bash -c` con el wrapper como string:

```javascript
const commandToRun = `bash -c ${shellQuote(wrapperScript)}`;
```

**Opción C:** Usar `eval`:

```javascript
const commandToRun = `eval ${shellQuote(wrapperScript)}`;
```

**Opción D (recomendada):** Cambiar `TerminalTTY.jsx` para enviar un here-document:

```javascript
const cleanCommand = `cat << 'DEVHUB_WRAPPER_EOF' | bash
${initialCommand.replace(/\s*#recovery-\d+\s*$/, '')}
DEVHUB_WRAPPER_EOF`;
```

### Paso 3: Probar Hipótesis F (backslash de continuación)

Revisar si el curl multilínea con `\` al final está causando el problema. Probar generar el heartbeat y exit trap en una sola línea (sin backslashes).

### Paso 4: Verificar valores reales

Ejecutar un lanzamiento de prueba y revisar los logs para ver:

- ¿Qué valores reales tienen los campos?
- ¿El wrapper generado pasa `bash -n`?
- ¿Cuál es el contenido exacto alrededor de la línea 44 del wrapper?

---

## 8. Archivos Relevantes

| Archivo                                           | Rol                             | Líneas Clave                                                                               |
| ------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------ |
| `src/lib/agentLaunchWrapper.js`                   | Genera el wrapper bash          | 22-256 (todo el archivo)                                                                   |
| `src/lib/agentLaunchCommand.js`                   | Quoting chain para innerCommand | 73-92 (shellQuote, buildTmuxWrappedCommand)                                                |
| `src/lib/docopsPrompts.js`                        | `shellQuotePrompt`              | Buscar `shellQuotePrompt`                                                                  |
| `src/components/TerminalTTY.jsx`                  | Envía comando al PTY            | 1609-1619                                                                                  |
| `src/app/api/agenthub/operations/health/route.js` | Orquesta el lanzamiento         | 138-160 (buildLaunchCommand), 881-1040 (configureLaunchRole), 1053-1340 (launchSwarmLocal) |
| `src/components/TerminalWorkspacesManager.jsx`    | Crea paneles con initialCommand | 2339-2388 (createWorkspaceForSwarmLaunchRequests)                                          |
| `src/lib/__tests__/agentLaunchCwd.test.js`        | Tests de quoting                | 1-154                                                                                      |

---

## 9. Contexto del Proyecto (para el agente que continúe)

Este error está en el contexto de la integración Swarm ↔ SDD. Los cambios recientes incluyen:

- Prompts swarm rediseñados con contratos SDD
- UI integrado (SwarmPhaseBadge, SwarmReactivateButton)
- MiniMax M2.7 como modelo default
- SDD enabled por defecto
- Wizard en español
- Migraciones DB para agent_workspaces

**Commit base de esta rama:** La rama `feature/session-workspace-restore` tiene múltiples commits de esta integración. El fix más reciente es `72e192b`.

**Tests:** `npm test` tiene ~110 tests pasando. El único fallo pre-existente es `SwarmControl.chrome.test.js`.

---

## 10. Checklist para el Agente Continuador

- [ ] Leer este documento completo
- [ ] Leer `src/lib/agentLaunchWrapper.js` completo
- [ ] Leer `src/lib/agentLaunchCommand.js`
- [ ] Leer `TerminalTTY.jsx:1600-1620`
- [ ] Agregar logging para capturar el comando exacto enviado al PTY
- [ ] Ejecutar un lanzamiento de prueba y revisar logs
- [ ] Identificar si el problema es:
  - [ ] Valores con comillas simples en campos (agentId, workspacePath, role)
  - [ ] El modo de ejecución (script multilínea en zsh interactivo)
  - [ ] Backslash de continuación de línea
  - [ ] Algo no identificado aún
- [ ] Aplicar fix y verificar con el usuario
- [ ] Actualizar tests si es necesario
- [ ] Commit con conventional commit
