# DevHub Swarm - Documentación de Debugging y Mejoras

> **Última actualización:** 2026-05-29
> **Estado:** 🟡 En progreso - Sistema funcional con bugs conocidos

## Visión General

El sistema de Swarm de DevHub permite lanzar múltiples agentes de IA (opencode) trabajando simultáneamente en un mismo proyecto. Cada agente tiene un rol definido:

- **Director:** Orquesta y coordina al equipo
- **Architect:** Diseña la arquitectura y toma decisiones técnicas
- **Coder:** Implementa el código
- **Auditor:** Revisa calidad y seguridad
- **DevOps:** Maneja infraestructura y deployment

## Arquitectura del Sistema

### Flujo de Lanzamiento

1. **Inicio:** Usuario clickea "Lanzar Arranque limpio guiado" en la UI
2. **Worktrees:** Se crean directorios independientes para cada agente en `.devhub/worktrees/{mission-id}/{role}/`
3. **TMUX:** ttyServer crea sesiones tmux (`devhub-swarm-{mission-id}-{role}`)
4. **OpenCode:** Se ejecuta `opencode chat` en cada sesión tmux
5. **Bootstrap:** Se inyecta el prompt de rol vía `tmux send-keys` después de 10s
6. **Monitoreo:** La UI se conecta a las sesiones tmux para mostrar output en tiempo real

### Componentes Clave

| Componente                    | Archivo                                   | Responsabilidad                                        |
| ----------------------------- | ----------------------------------------- | ------------------------------------------------------ |
| `useSwarmLaunchController.js` | `src/components/terminal/hooks/`          | Orquesta el lanzamiento del swarm                      |
| `agentLaunchWrapper.js`       | `src/lib/`                                | Script de bootstrap que detecta tmux e inyecta prompts |
| `agentLaunchCommand.js`       | `src/lib/`                                | Construye los comandos para ejecutar opencode          |
| `route.js` (health)           | `src/app/api/agenthub/operations/health/` | API endpoint que lanza agentes                         |
| `prepareAgentWorktree.js`     | `src/lib/`                                | Prepara los directorios de trabajo                     |

---

## Bugs Identificados y Fixes Aplicados

### Bug #1: Swarm quedaba en "waiting" - No se creaban sesiones tmux

**Síntoma:** Los agentes se quedaban en estado "waiting" indefinidamente.

**Causa raíz:** En `route.js:164` existía `disableTmuxWrap: true` que desactivaba la creación de sesiones tmux.

**Fix:** Remover `disableTmuxWrap: true` de `buildLaunchCommand`.

**Archivo modificado:**

- `src/app/api/agenthub/operations/health/route.js` - Línea 164

**Commit:** `fix: remove disableTmuxWrap to allow tmux session creation`

---

### Bug #2: TMUX session name mismatch - "can't find session"

**Síntoma:** Algunos agentes morían con error `[exited] can't find session`.

**Causa raíz:** El script `agentLaunchWrapper.js` intentaba auto-detectar la sesión tmux con `tmux display-message -p '#S'`, pero esto fallaba porque:

1. El wrapper se ejecutaba como input PTY, no como comando tmux inicial
2. La variable `TMUX` no estaba seteada correctamente
3. Múltiples agentes iniciaban simultáneamente causando race conditions

**Fix:** Usar `DEVHUB_TMUX_SESSION` (variable de entorno) como primera opción antes de intentar auto-detectar.

**Archivo modificado:**

- `src/lib/agentLaunchWrapper.js`

**Código del fix:**

```bash
# Antes (problemático):
TMUX_SESSION=$(tmux display-message -p '#S' 2>/dev/null)

# Después (robusto):
TMUX_SESSION="${DEVHUB_TMUX_SESSION:-$(tmux display-message -p '#S' 2>/dev/null)}"
```

---

### Bug #3: Race condition en bootstrap prompt

**Síntoma:** Los prompts de bootstrap se inyectaban antes de que opencode estuviera listo, resultando en prompts perdidos.

**Causa raíz:** El wrapper bash ejecutaba `(_devhub_bootstrap_prompt) &` en background sin esperar suficiente tiempo.

**Fix:** Aumentar `sleep` de 3s a 10s para darle tiempo a opencode de inicializar completamente.

**Archivo modificado:**

- `src/lib/agentLaunchWrapper.js`

---

### Bug #4: Inyección múltiple de prompts (ACTIVO)

**Síntoma:** Los prompts se inyectan múltiples veces en una misma sesión. Conteo observado:

- architect: 4 inyecciones
- auditor: 4 inyecciones
- coder: 6 inyecciones (el peor caso)
- devops: 5 inyecciones
- director: 4 inyecciones

**Causa raíz (hipótesis):**

1. El wrapper bash se ejecuta múltiples veces (posiblemente por reconexiones de tmux)
2. La función `_devhub_bootstrap_prompt` no tiene protección contra ejecución duplicada
3. Las reconexiones de la UI al websocket pueden estar disparando re-lanzamientos

**Impacto:** Los agentes reciben el mismo prompt varias veces, lo que puede causar:

- Confusión en el comportamiento del agente
- Consumo innecesario de tokens
- Posibles loops o comportamientos erráticos

**Fix aplicado (2026-05-29):**

- Agregado lock file `/tmp/devhub-bootstrap-{mission}-{role}.lock` en `agentLaunchWrapper.js`
- La función `_devhub_bootstrap_prompt` verifica el lock antes de inyectar
- Si el lock existe, salta la inyección con mensaje de log

**Archivo modificado:**

- `src/lib/agentLaunchWrapper.js`

**Estado:** 🟢 **RESUELTO** - Pendiente verificación en próximo test

---

### Bug #5: Ventanas vacías / sin contenido (ACTIVO)

**Síntoma:** Algunas ventanas de agentes en la UI muestran contenido vacío o solo el banner inicial.

**Causa raíz (hipótesis):**

1. El agente no recibió el prompt de bootstrap correctamente
2. La sesión tmux existe pero opencode no está procesando input
3. Problemas de sincronización entre la creación de la sesión y la conexión de la UI

**Estado:** 🟡 **NO RESUELTO** - Posiblemente relacionado con Bug #4

---

### Bug #6: Director muestra "QUEUED" (ACTIVO)

**Síntoma:** El agente Director muestra mensajes "QUEUED" en lugar de contenido normal.

**Causa raíz:** Investigando. Posiblemente:

1. El director tiene una lógica especial de orquestación que muestra estados de cola
2. Problema de sincronización con los demás agentes

**Estado:** 🟡 **INVESTIGANDO**

---

### Bug #7: Agentes mueren a los ~30 segundos - Error ArrayLimit (ACTIVO)

**Síntoma:** 4 de 5 agentes (coder, architect, auditor, devops) mueren aproximadamente 30 segundos después del lanzamiento. Solo el Director sobrevive. Las ventanas muestran `[exited]`.

**Evidencia:**

- Logs del servidor muestran `GLib-WARNING: waitid(pid:xxx) failed: No hay ningún proceso hijo` para 4 PIDs
- Tmux sessions desaparecen para todos excepto Director
- Usuario reportó ver error de OpenCode: `ArrayLimit` por milésimas de segundo
- Los 4 agentes "fanout" se lanzan simultáneamente (`startAfterMs: 4000`)

**Causa raíz (hipótesis):**

1. **Rate limit del plan MiniMax:** 5 requests simultáneas al modelo `MiniMax-M2.7`
2. **Error interno de OpenCode:** `ArrayLimit` sugiere un límite de array excedido en V8/Node.js
3. **Recursos del sistema:** 5 instancias de opencode consumen mucha memoria/CPU simultáneamente

**Impacto:** Swarm completamente inoperativo - solo Director sobrevive, no hay trabajo colaborativo.

**Fix propuesto:**

1. Agregar delay escalonado entre agentes fanout (staggered launch)
2. Mejorar logging para capturar stderr de opencode (ver fixes aplicados abajo)
3. Considerar reducir concurrencia o usar modelo con límites más altos

**Estado:** 🔴 **CRÍTICO - Bloquea operación del swarm**

---

## Descubrimientos Importantes

### 1. Comunicación entre agentes FUNCIONA

✅ **Confirmado:** El sistema de comunicación entre agentes está operativo. Cuando un agente "muere" o tiene problemas, los demás agentes (incluyendo el Director) detectan la caída y reportan el problema. Esto es un indicador de que la arquitectura base del swarm es sólida.

**Implicación:** Los problemas actuales son de estabilidad/robustez, no de diseño arquitectónico.

### 2. opencode.json no se copiaba a worktrees

**Descubierto:** El archivo `.gitignore` excluía `opencode.json`, por lo que los worktrees de agentes no tenían acceso a la configuración de opencode.

**Fix aplicado:** `prepareAgentWorktree.js` ahora copia manualmente `opencode.json` al worktree del agente.

### 3. DEVHUB_TMUX_SESSION no se exportaba

**Descubierto:** La variable de entorno `DEVHUB_TMUX_SESSION` no se estaba exportando en `buildAgentEnvExports`, causando que el wrapper no pudiera identificar su sesión tmux.

**Fix aplicado:** Agregar `DEVHUB_TMUX_SESSION` a las variables de entorno exportadas.

### 4. Sidecar port file causaba conflictos

**Descubierto:** El archivo `~/.devhub/sidecar-port.txt` persistía entre sesiones, causando que los agentes se conectaran a un sidecar antiguo.

**Workaround:** Limpiar el archivo antes de lanzar el swarm.

### 5. Logs se acumulan entre lanzamientos

**Descubierto:** Los archivos de log en `/tmp/devhub-swarm-{role}.log` no se limpian entre lanzamientos, haciendo difícil diagnosticar problemas de una sesión específica.

**Recomendación:** Agregar timestamp al nombre del archivo de log o limpiar logs antiguos antes de cada lanzamiento.

---

## Fixes Pendientes (TODO)

### Alta Prioridad

1. **[BUG-4] Prevenir inyección múltiple de prompts**
   - Agregar lockfile o flag de estado en `agentLaunchWrapper.js`
   - Verificar si el prompt ya fue enviado antes de inyectar

2. **[BUG-5] Investigar ventanas vacías**
   - Revisar si opencode está recibiendo el prompt correctamente
   - Verificar logs de opencode para errores
   - Confirmar que la sesión tmux está activa y procesando input

3. **[BUG-6] Investigar "QUEUED" en Director**
   - Revisar lógica especial del Director
   - Verificar si hay problemas de sincronización

### Media Prioridad

4. **Limpiar logs entre lanzamientos**
   - Agregar timestamp a los nombres de archivo de log
   - O implementar rotación de logs

5. **Manejo de errores de tmux**
   - Mejorar la detección de sesiones tmux caídas
   - Auto-reconnect o notificación de fallos

6. **Validación de worktrees**
   - Verificar que los worktrees se crearon correctamente
   - Confirmar que `opencode.json` existe en cada worktree

### Baja Prioridad

7. **Documentar flujo completo en diagrama**
   - Crear diagrama de secuencia del lanzamiento del swarm

8. **Tests automatizados para el swarm**
   - Script de smoke test que verifique que todos los agentes arrancan
   - Verificación de que los prompts llegan correctamente

---

## Configuración de Desarrollo

### Requisitos para Testing

- **Tauri dev:** `npm run tauri:dev` (requiere entorno gráfico)
- **Variables de entorno:**
  ```bash
  export DISPLAY=:0  # Para Tauri/GUI
  ```

### Comandos Útiles para Debugging

```bash
# Ver procesos opencode activos
ps aux | grep "opencode" | grep -v grep

# Ver sesiones tmux activas
tmux ls | grep "devhub-swarm"

# Ver logs del servidor
tail -f /tmp/devhub-tauri.log

# Ver logs de agentes específicos
tail -f /tmp/devhub-swarm-{role}.log

# Contar inyecciones de prompts
grep -c "Prompt injection complete" /tmp/devhub-swarm-{role}.log

# Limpiar todo antes de un nuevo test
rm -f ~/.devhub/sidecar-port.txt /tmp/devhub-swarm-*.log
```

### Estructura de Archivos de Log

```
/tmp/devhub-tauri.log              # Log del servidor principal
/tmp/devhub-swarm-{role}.log       # Log de cada agente (architect, coder, etc.)
~/.devhub/sidecar-port.txt         # Puerto del sidecar (puede causar conflictos si persiste)
```

---

## Historial de Cambios

| Fecha      | Descripción                                            | Archivos                  |
| ---------- | ------------------------------------------------------ | ------------------------- |
| 2026-05-29 | Remover `disableTmuxWrap: true`                        | `route.js:164`            |
| 2026-05-29 | Fix detección de sesión tmux                           | `agentLaunchWrapper.js`   |
| 2026-05-29 | Aumentar sleep bootstrap a 10s                         | `agentLaunchWrapper.js`   |
| 2026-05-29 | Copiar `opencode.json` a worktrees                     | `prepareAgentWorktree.js` |
| 2026-05-29 | Exportar `DEVHUB_TMUX_SESSION`                         | `buildAgentEnvExports`    |
| 2026-05-29 | Mejorar logging: timestamps, lock file, captura stderr | `agentLaunchWrapper.js`   |
| 2026-05-29 | Deduplicación de prompts con lock file                 | `agentLaunchWrapper.js`   |

---

## Referencias

- [08_Enjambre_Agentes_y_Orquestacion.md](../08_Enjambre_Agentes_y_Orquestacion.md) - Documento original del swarm
- [13_Swarm_Autonomo_v2.md](../13_Swarm_Autonomo_v2.md) - Especificación v2
- [42_Swarm_Bootstrap_Logging_Handoff.md](../42_Swarm_Bootstrap_Logging_Handoff.md) - Handoff anterior
- [43_Swarm_SDD_Integration_Design.md](../43_Swarm_SDD_Integration_Design.md) - Diseño de integración SDD

---

_Este documento es un registro vivo. Actualizar después de cada sesión de debugging._
