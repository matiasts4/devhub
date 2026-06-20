# Zed: Fase 8 — Autonomía supervisada

**Estado**: draft  
**Última actualización**: 2026-06-20  
**Propietario**: DevHub team  
**Proyecto MCP**: `fd1d5538-6d55-499e-8928-8ee93aa64cc7` — _Zed: Asistente y Agente DevHub_

---

## 1. Resumen ejecutivo

Hasta la Fase 7, Zed responde comandos y propone planes, pero la ejecución requiere que el usuario esté presente para aprobar cada paso. La **Fase 8** habilita la **ejecución supervisada de planes aprobados**: una vez que el usuario confirma un plan, Zed puede avanzar por los pasos en segundo plano, reportar progreso, pedir aprobación solo en puntos de riesgo y recuperarse de fallos recuperables.

La clave es que la autonomía sea **supervisada**, no silenciosa: el usuario siempre puede ver qué está haciendo Zed, pausar o cancelar.

---

## 2. Objetivos

- Ejecutar planes aprobados paso a paso sin intervención humana en cada paso.
- Notificar progreso y resultados parciales mediante el drawer de actividad y, opcionalmente, TTS.
- Re-pedir confirmación humana solo para:
  - acciones destructivas,
  - gasto de recursos (lanzar múltiples agentes),
  - pasos con error o ambigüedad.
- Recuperar errores recuperables (reintentar tool, re-lanzar agente caído).
- Pausar/cancelar un plan en ejecución.

---

## 3. Componentes afectados

| Componente                                  | Cambio                                                               |
| ------------------------------------------- | -------------------------------------------------------------------- |
| `src/lib/asistente/planExecutor.js` (nuevo) | Motor de ejecución de planes con máquina de estados.                 |
| `src/lib/asistente/useZedChat.js`           | Integrar executor; mostrar paso actual y progreso.                   |
| `src/lib/asistente/zedMemory.js`            | Guardar planes en ejecución y estado de cada paso.                   |
| `src/lib/asistente/ZedActivityDrawer.jsx`   | Mostrar progreso del plan, pasos completados, botón pausar/cancelar. |
| `src/lib/asistente/tools/planner.js`        | Generar planes con dependencias y puntos de confirmación.            |
| `src/lib/asistente/tools/agentRuns.js`      | Monitorear runs delegados y reportar al executor.                    |

---

## 4. Máquina de estados del plan

```
approved -> running -> step_done -> ... -> completed
              |         |
              v         v
           awaiting_human   failed
              |              |
              +---> resumed   +---> retried / aborted
```

Estados:

- `approved`: plan confirmado por el usuario.
- `running`: ejecutando un paso.
- `awaiting_human`: esperando confirmación para un paso crítico.
- `paused`: usuario pausó el plan.
- `failed`: paso falló y no es recuperable.
- `completed`: todos los pasos terminados.
- `aborted`: usuario canceló.

---

## 5. Reglas de confirmación durante ejecución

### No requiere confirmación

- Leer estado de DevHub MCP.
- Ejecutar comando permitido en terminal existente.
- Abrir terminal con agente ya aprobado en el plan.

### Requiere confirmación explícita

- Cerrar más de una terminal.
- Ejecutar comando destructivo/irreversible.
- Lanzar swarm o múltiples agentes simultáneos.
- Modificar estado de tarea/hito crítico.

---

## 6. Recuperación de errores

| Error                           | Estrategia                                                               |
| ------------------------------- | ------------------------------------------------------------------------ |
| Tool devuelve error transitorio | Reintentar hasta 3 veces con backoff.                                    |
| Agente externo no responde      | Verificar heartbeat; re-lanzar si está caído.                            |
| Lease de tarea expirado         | Reclamar o renovar lease.                                                |
| Error no recuperable            | Marcar paso como `failed`, notificar usuario, ofrecer continuar/abortar. |

---

## 7. Interfaz de usuario

- **Drawer de actividad**:
  - Barra de progreso: `paso_actual / total_pasos`.
  - Lista de pasos: completado ✓, en curso ⟳, fallado ✗, pendiente ○.
  - Botones: **Pausar**, **Reanudar**, **Cancelar**.
- **Aura/pill**:
  - Estado `delegating` cuando Zed está esperando un agente externo.
  - Notificación breve al completar cada paso.

---

## 8. Criterios de aceptación

- [ ] Plan aprobado se ejecuta sin intervención en pasos de bajo riesgo.
- [ ] Pasos críticos detienen la ejecución y piden confirmación.
- [ ] Usuario puede pausar, reanudar y cancelar un plan en ejecución.
- [ ] Estado del plan persiste en `localStorage` y se recupera al recargar.
- [ ] Errores transitorios se reintentan automáticamente.
- [ ] Errores no recuperables notifican al usuario con opción de continuar/abortar.
- [ ] Tests de integración cubren flujo completo: aprobación → ejecución → finalización.
- [ ] Commit checkpoint con `[git:checkpoint]`.

---

## 9. Tareas propuestas para DevHub MCP

1. Diseñar máquina de estados del plan executor.
2. Implementar `planExecutor.js` con reintentos y pausado.
3. Integrar executor en `useZedChat` y UI de progreso.
4. Persistir estado de planes en `zedMemory.js`.
5. Actualizar `ZedActivityDrawer` con progreso y controles.
6. Tests de integración de ejecución de planes.
7. Commit checkpoint Fase 8.
