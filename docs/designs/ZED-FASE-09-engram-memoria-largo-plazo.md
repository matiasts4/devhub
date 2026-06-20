# Zed: Fase 9 — Integración con Engram / memoria a largo plazo

**Estado**: draft  
**Última actualización**: 2026-06-20  
**Propietario**: DevHub team  
**Proyecto MCP**: `fd1d5538-6d55-499e-8928-8ee93aa64cc7` — _Zed: Asistente y Agente DevHub_

---

## 1. Resumen ejecutivo

La memoria de la Fase 6 (`zedMemory.js`) es estructural y local: guarda preferencias, acciones recientes y planes. La **Fase 9** amplía esto con **memoria semántica de largo plazo** mediante Engram (u otro store vectorial/memoria durable del ecosistema DevHub).

Zed podrá recordar:

- decisiones de diseño del usuario,
- estilo de respuesta preferido,
- proyectos recurrentes y contextos,
- errores frecuentes y cómo se resolvieron,
- relaciones entre tareas, agentes y resultados.

---

## 2. Objetivos

- Guardar recuerdos semánticos fuera del navegador (Engram / MCP / store durable).
- Recuperar recuerdos relevantes antes de responder o planificar.
- Aprender preferencias implícitas a partir de interacciones.
- Mantener `zedMemory.js` como caché local rápida; Engram como fuente de verdad duradera.

---

## 3. Tipos de memoria

| Tipo                  | Ejemplo                                                  | TTL        |
| --------------------- | -------------------------------------------------------- | ---------- |
| Preferencia explícita | "Usá modo oscuro"                                        | indefinido |
| Hecho de proyecto     | "El router usa Next.js App Router"                       | indefinido |
| Patrón de interacción | "El usuario prefiere planes cortos"                      | 90 días    |
| Error resuelto        | "El build falló por Node 18; se resolvió con nvm use 20" | 30 días    |
| Contexto de sesión    | "Estoy trabajando en la Fase 7 de Zed"                   | 24 horas   |

---

## 4. Componentes afectados

| Componente                               | Cambio                                                   |
| ---------------------------------------- | -------------------------------------------------------- |
| `src/lib/asistente/zedEngram.js` (nuevo) | Cliente de lectura/escritura de recuerdos.               |
| `src/lib/asistente/zedMemory.js`         | Usar Engram como backing store; conservar caché local.   |
| `src/lib/asistente/buildZedHistory.js`   | Enriquecer historia con recuerdos relevantes.            |
| `src/lib/asistente/zedSystemPrompt.js`   | Incluir preferencias y hechos clave en el system prompt. |
| `src/lib/asistente/useZedChat.js`        | Sincronizar recuerdos al inicio de sesión.               |

---

## 5. Flujo de recuperación

1. Usuario envía mensaje.
2. Zed extrae entidades del mensaje (proyecto, tarea, agente, etc.).
3. Consulta Engram con embedding del mensaje + entidades.
4. Recupera top-k recuerdos relevantes.
5. Incluye los recuerdos en el contexto del LLM/fast-path.
6. Genera respuesta/plan.

---

## 6. Flujo de escritura

1. Al finalizar una interacción relevante, Zed genera uno o más "recuerdos".
2. Cada recuerdo tiene: `content`, `kind`, `project_id`, `task_id`, `agent_id`, `timestamp`, `source`.
3. Se escribe en Engram de forma asíncrona (no bloquea la respuesta).
4. Se actualiza `zedMemory.js` como caché inmediata.

---

## 7. Privacidad y control

- El usuario puede ver todos los recuerdos almacenados.
- Puede borrar recuerdos individuales o por categoría.
- Recuerdos sensibles (tokens, contraseñas) deben detectarse y nunca almacenarse.

---

## 8. Criterios de aceptación

- [ ] Zed recupera recuerdos relevantes antes de responder.
- [ ] Los recuerdos mejoran la precisión del routing y de las respuestas.
- [ ] Preferencias explícitas se sincronizan entre dispositivos/sesiones.
- [ ] Escritura de recuerdos no aumenta la latencia percibida (>100 ms).
- [ ] Usuario puede listar, editar y borrar recuerdos.
- [ ] Tests de integración con mock de Engram.
- [ ] Commit checkpoint con `[git:checkpoint]`.

---

## 9. Tareas propuestas para DevHub MCP

1. Definir schema de recuerdos y contrato con Engram.
2. Implementar `zedEngram.js` (cliente mock + real).
3. Integrar recuperación de recuerdos en `buildZedHistory`.
4. Integrar escritura de recuerdos tras interacciones relevantes.
5. Agregar UI de gestión de recuerdos (vista simple en drawer).
6. Tests de integración de memoria a largo plazo.
7. Commit checkpoint Fase 9.
