# Swarm Debug Session Log

> Registro detallado de cada sesión de debugging y testing del swarm.
> Formato: Fecha, problemas encontrados, fixes aplicados, estado final.

---

## 2026-05-29 - Sesión Inicial: Swarm Stuck en "Waiting"

### Problema Reportado

El usuario reportó que el swarm se queda en estado "waiting" y no arranca.

### Diagnóstico

#### Issue 1: No se creaban sesiones tmux

- **Síntoma:** `ps aux | grep tmux` mostraba 0 procesos
- **Causa:** `disableTmuxWrap: true` en `route.js:164`
- **Verificación:** `buildTmuxWrappedCommand` construía el comando correctamente pero nunca se ejecutaba

#### Issue 2: TMUX session name mismatch

- **Síntoma:** `[exited] can't find session`
- **Causa:** `agentLaunchWrapper.js` intentaba auto-detectar sesión con `tmux display-message -p '#S'` pero fallaba
- **Detalle:** El wrapper corre como PTY input, no como comando tmux inicial. `TMUX` variable no está seteada.

#### Issue 3: Race condition en bootstrap

- **Síntoma:** Prompts no llegaban o llegaban incompletos
- **Causa:** `sleep 3` era insuficiente para que opencode inicialice
- **Fix:** Aumentar a `sleep 10`

#### Issue 4: opencode.json no en worktrees

- **Síntoma:** Agentes no encontraban configuración
- **Causa:** `.gitignore` excluía `opencode.json`, por lo que `git worktree` no lo copiaba
- **Fix:** Copiar manualmente en `prepareAgentWorktree.js`

#### Issue 5: Sidecar port file conflictivo

- **Síntoma:** Agentes se conectaban a sidecar viejo
- **Causa:** `~/.devhub/sidecar-port.txt` persistía entre sesiones
- **Workaround:** Eliminar archivo antes de lanzar

### Fixes Aplicados

1. ✅ Removido `disableTmuxWrap: true` de `route.js`
2. ✅ Fix en `agentLaunchWrapper.js`: usar `DEVHUB_TMUX_SESSION` antes que auto-detect
3. ✅ Aumentado `sleep` a 10s en bootstrap
4. ✅ Copiar `opencode.json` a worktrees
5. ✅ Exportar `DEVHUB_TMUX_SESSION` en env vars

### Resultado

- Swarm ahora arranca ✅
- Todos los agentes se inician ✅
- Pero hay **bugs nuevos** detectados:
  - Prompts se inyectan múltiples veces
  - Algunas ventanas vacías
  - Director muestra "QUEUED"

### Bugs Nuevos Descubiertos

#### Bug A: Inyección múltiple de prompts

- **Conteo observado:** architect:4, auditor:4, coder:6, devops:5, director:4
- **Hipótesis:** Wrapper se ejecuta múltiples veces, falta deduplicación
- **Estado:** 🔴 No resuelto

#### Bug B: Ventanas vacías

- **Síntoma:** Algunos paneles tmux sin contenido
- **Estado:** 🔴 No resuelto

#### Bug C: Director muestra "QUEUED"

- **Síntoma:** Director no muestra output normal, solo estados de cola
- **Estado:** 🔴 No resuelto

### Descubrimiento Positivo

✅ **La comunicación entre agentes FUNCIONA.** Cuando un agente tiene problemas, los demás (incluyendo el Director) detectan y reportan la caída. Esto confirma que la arquitectura base es sólida.

### Notas

- Usuario ejecutó con `npm run dev` inicialmente (versión web), luego cambió a `npm run tauri:dev` (versión desktop)
- Tauri compiló correctamente (554 crates, ~49s)
- Servidor levantado en background con `nohup`

---

## Template para Próximas Sesiones

```markdown
## YYYY-MM-DD - Título de la Sesión

### Problema Reportado

[Describir el problema que reportó el usuario o que se detectó]

### Diagnóstico

[Detallar el proceso de investigación, comandos ejecutados, hallazgos]

### Fixes Aplicados

- [ ] Fix 1
- [ ] Fix 2

### Resultado

[¿Funcionó? ¿Qué quedó pendiente?]

### Bugs Nuevos

- [Bug X] Descripción

### Notas

[Cualquier observación adicional]
```

---

_Última actualización: 2026-05-29_
_Próxima sesión: Investigar Bug A (inyección múltiple)_
