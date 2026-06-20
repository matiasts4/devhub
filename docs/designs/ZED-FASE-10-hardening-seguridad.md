# Zed: Fase 10 — Hardening y seguridad

**Estado**: draft  
**Última actualización**: 2026-06-20  
**Propietario**: DevHub team  
**Proyecto MCP**: `fd1d5538-6d55-499e-8928-8ee93aa64cc7` — _Zed: Asistente y Agente DevHub_

---

## 1. Resumen ejecutivo

A medida que Zed gana autonomía (Fase 8) y memoria (Fase 9), la superficie de ataque crece. La **Fase 10** endurece la seguridad: sandbox de comandos, políticas de confirmación configurables, audit trail inmutable y detección de intentos de jailbreak o extracción de datos.

El objetivo es que Zed pueda operar con confianza incluso cuando reciba prompts maliciosos o comandos accidentales.

---

## 2. Objetivos

- Sandbox estricto para comandos y acceso a archivos.
- Políticas de confirmación configurables por usuario y por proyecto.
- Audit trail inmutable de todas las acciones ejecutadas.
- Detección y bloqueo de prompts maliciosos (jailbreak, exfiltración).
- Rotación/aislamiento de credenciales y tokens.
- Límites de rate y presupuesto para agentes externos.

---

## 3. Áreas de seguridad

### 3.1 Sandbox de comandos

- Lista blanca de comandos permitidos por defecto.
- Rechazo de `sudo`, `rm -rf /`, `curl | sh`, `eval`, etc.
- Confirmación obligatoria para comandos que matcheen patrones de riesgo.
- Ejecución en shell con permisos restringidos cuando sea posible.

### 3.2 Sandbox de archivos

- `pathSandbox` ya restringe al workspace; endurecer con:
  - denegación de symlinks que escapen,
  - denegación de paths con null bytes o traversal (`..`),
  - validación de existencia antes de escritura.

### 3.3 Políticas de confirmación

| Nivel      | Descripción                                                           |
| ---------- | --------------------------------------------------------------------- |
| `paranoid` | Toda acción destructiva o MCP requiere confirmación.                  |
| `default`  | Solo acciones de riesgo alto y planes multi-paso.                     |
| `trusted`  | Solo acciones de muy alto riesgo (borrado masivo, gasto de recursos). |

Configuración por usuario y override por proyecto.

### 3.4 Audit trail

- Cada tool ejecutada se registra con: timestamp, mensaje del usuario, tool, input, output, modelo, confianza, aprobación.
- Almacenamiento append-only.
- Exportable para auditoría humana.

### 3.5 Detección de prompts maliciosos

- Patrones de jailbreak (`DAN`, `ignore previous instructions`, etc.).
- Intento de exfiltración de `.env`, claves SSH, etc.
- Intento de generar código ofuscado.
- Respuesta por defecto: rechazo educado y log de seguridad.

### 3.6 Rate limits y presupuesto

- Límite de llamadas LLM por minuto.
- Límite de agentes lanzados por hora.
- Límite de tokens consumidos por sesión.

---

## 4. Componentes afectados

| Componente                                       | Cambio                                                 |
| ------------------------------------------------ | ------------------------------------------------------ |
| `src/lib/asistente/zedSecurityPolicy.js` (nuevo) | Motor de políticas y detección de riesgo.              |
| `src/lib/asistente/zedCommandPolicy.js`          | Reforzar lista blanca/negra de comandos.               |
| `src/lib/asistente/tools/pathSandbox.js`         | Validaciones adicionales de paths.                     |
| `src/lib/asistente/zedAuditTrail.js`             | Append-only, export, inmutabilidad.                    |
| `src/lib/asistente/useZedChat.js`                | Aplicar nivel de confirmación antes de ejecutar tools. |
| `src/lib/asistente/zedSystemPrompt.js`           | Instrucciones de seguridad para el modelo.             |

---

## 5. Criterios de aceptación

- [ ] Todos los comandos destructivos requieren confirmación sin excepción.
- [ ] `pathSandbox` rechaza traversal, symlinks maliciosos y null bytes.
- [ ] Audit trail es append-only y no puede borrarse desde la UI.
- [ ] Detección de jailbreak bloquea al menos 10 patrones conocidos.
- [ ] Políticas configurables persisten por usuario.
- [ ] Rate limits detienen ejecución al alcanzarse.
- [ ] Tests de seguridad con casos de ataque documentados.
- [ ] Commit checkpoint con `[git:checkpoint]`.

---

## 6. Tareas propuestas para DevHub MCP

1. Definir niveles de política de confirmación.
2. Implementar `zedSecurityPolicy.js` con detección de riesgo.
3. Endurecer `pathSandbox` y `zedCommandPolicy`.
4. Hacer `zedAuditTrail.js` append-only y exportable.
5. Implementar rate limits y presupuesto.
6. Agregar tests de seguridad con casos de ataque.
7. Commit checkpoint Fase 10.
