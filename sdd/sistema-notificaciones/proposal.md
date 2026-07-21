# Proposal: Sistema de Notificaciones & Presence Engine Integration

## Intent

Implementar un **Sistema de Notificaciones Funcional y Unificado** en DevHub que responda en tiempo real a las transiciones de estado de presencia de agentes (`idle`, `running`, `stalled`, `failed`, `completed`), vencimientos de tareas/deadlines y salud del sistema.

Actualmente, DevHub cuenta con un rastreo de presencia a nivel de CLI/bus (`devhub presence`, `heartbeat`), pero el panel de notificaciones en la interfaz (`NotificationCenter.jsx`) opera únicamente con polling local cada 60 segundos sobre tareas en SQLite/Supabase y `localStorage`. Este proposal define la integración completa entre la detección de actividad/presencia de agentes y el motor de entrega de notificaciones omnicanal (UI Toasts, Barra Superior, OS Desktop Toasts y Telegram Bridge).

---

## Scope

### In Scope

1. **Motor de Eventos de Presencia y Agentes**:
   - Captura de transiciones de estado de agentes en tiempo real (`idle` -> `running`, `running` -> `stalled` / `failed`, `running` -> `completed`).
   - Monitor de latidos (Heartbeat Timeout Monitor): notificación automática si un agente en estado `running` deja de enviar latidos por más de 30 segundos (`stalled`) o 60 segundos (`failed`).

2. **Gestor Central de Notificaciones (`notificationManager`)**:
   - Almacenamiento persistente local con soporte para lectura/no leído (`read_at`), niveles de severidad (`info`, `success`, `warning`, `critical`).
   - Algoritmo de deduplicación avanzada mediante `dedupe_key` y ventana de supresión de ráfagas (debouncing).
   - Política de retención y limpieza automática (máximo 200 elementos o 7 días).

3. **Entrega Omnicanal (Multi-Channel Delivery)**:
   - **In-App Toast Stack**: Notificaciones flotantes animadas con auto-dismiss y acciones rápidas ("Ver Agente", "Reintentar", "Ir a Tarea").
   - **NotificationCenter UI**: Centro de notificaciones completo en panel lateral y topbar con pestañas por categoría (*Agentes & Swarm*, *Tareas & Deadlines*, *Sistema & Salud*).
   - **OS Desktop Native Toasts**: Integración con las notificaciones del sistema operativo (vía Tauri Notification API o Web Notifications API) cuando DevHub está minimizado o en segundo plano.
   - **Telegram Bridge (Opcional/Configurable)**: Reenvío de alertas críticas (`critical` / `failed`) al bot de Telegram configurado.

4. **Preferencias y Efectos Sonoros**:
   - Panel de ajustes de notificaciones (*Quiet Hours*, toggles por canal, filtro por severidad mínima).
   - Cuestión de feedback auditivo sutil (vía Web Audio API) para notificaciones de severidad `warning` y `critical`.

### Out of Scope

- Pasarelas de correo electrónico (Email) o SMS (diferido a la fase de infraestructura Cloud).
- Notificaciones Push móviles vía APNS/FCM (DevHub se enfoca en arquitectura local-first / Desktop HUB).

---

## Approach

La solución adopta una arquitectura basada en eventos (Event-Driven):

1. **Event Source Bus Integration**:
   - Conectar los eventos emitidos por `devhub-bus` y el motor de leases (`devhub-mcp`) con un bus interno de notificaciones (`NotificationEventBus`).
2. **State Machine Listener**:
   - Suscribir un listener al ciclo de vida de agentes que detecte deltas de presencia y dispare eventos normalizados `presence.state_changed`, `presence.stalled`, `presence.recovered`.
3. **Reactive UI Components**:
   - Refactorizar `NotificationCenter.jsx` para consumir el estado reactivo del `notificationManager`.
   - Crear el componente `NotificationToastStack.jsx` para alertas emergentes en pantalla.
4. **Desktop Native Bridge**:
   - Invocar la API de notificaciones nativas de Tauri / Electron Host cuando la ventana no tenga el foco (`document.hidden`).

---

## Affected Areas

| Área / Archivo | Impacto | Descripción |
| --- | --- | --- |
| `sdd/sistema-notificaciones/*` | Nuevo | Especificación completa del SDD (Proposal, Spec, Design, Tasks). |
| `src/lib/notifications/notificationManager.js` | Nuevo | Núcleo del gestor de notificaciones, deduplicación, almacenamiento y eventos. |
| `src/lib/notifications/presenceNotifier.js` | Nuevo | Listener especializado en interpretar transiciones de presencia de agentes y heartbeats. |
| `src/components/NotificationCenter.jsx` | Modificado | Refactorización de la UI para soportar pestañas, filtros, búsqueda y acciones rápidas. |
| `src/components/NotificationToastStack.jsx` | Nuevo | Contenedor de notificaciones flotantes con micro-animaciones. |
| `src/components/NotificationSettingsModal.jsx` | Nuevo | Modal de configuración de preferencias y canales. |
| `devhub-cli/bin/devhub-bus.js` | Modificado | Emisión de eventos de cambios de presencia hacia el bus del cliente. |
| `src/lib/operations/events.js` | Modificado | Extensión de esquemas de eventos operacionales para integrarse con `notificationManager`. |

---

## Risks & Mitigation

| Riesgo | Probabilidad | Mitigación |
| --- | --- | --- |
| **Tormenta de Notificaciones (Notification Storm)** | Alta | Implementar llaves de deduplicación dinámicas (`agent:{id}:stalled`) y ventana de enfriamiento (cooldown window) de 60 segundos por agente. |
| **Bloqueo de UI por Polling** | Media | Migrar de polling de 60s a arquitectura pub/sub orientada a eventos en memoria con sincronización diferida en disco/SQLite. |
| **Permisos Denegados en OS Desktop** | Media | Detección previa de soporte y permisos de SO; si no está permitido, fallback transparente a Toasts in-app. |
| **Ruidos/Alertas molestas para el usuario** | Media | Opción de silenciar por defecto (*Mute All*), modo "Do Not Disturb" y selección de severidad mínima. |

---

## Rollback Plan

- Los componentes nuevos están encapsulados en `src/lib/notifications/`. Si se requiere un rollback, se reactiva el componente `NotificationCenter.jsx` legacy mediante una variable de feature flag `NEXT_PUBLIC_ENABLE_NEW_NOTIFICATIONS=false`.
- Los datos de notificaciones se almacenan de manera independiente en `devhub:notifications:v2`, sin alterar la tabla base de `tasks` o `operational_events`.

---

## Dependencies

- **Tauri / Electron Notification API**: Disponible en la distribución Desktop.
- **Web Audio API**: Disponible en el navegador/WebView para tonos de alerta sintéticos.
- **DevHub Bus & Presence Engine**: CLI y bus de presencia en `devhub-cli/bin/devhub-bus.js`.

---

## Success Criteria

- [ ] Las transiciones de agentes (`running` -> `stalled`, `running` -> `failed`, `running` -> `completed`) generan notificaciones inmediatas (< 500ms).
- [ ] La UI actualiza el contador de no leídos en tiempo real sin requerir refresco manual ni polling pesado.
- [ ] Las notificaciones repetidas dentro de la ventana de enfriamiento son consolidadas en una única alerta deduplicada.
- [ ] Cuando la aplicación está minimizada, las alertas de severidad `warning` y `critical` se despliegan como notificaciones nativas del SO.
- [ ] El usuario puede filtrar por categorías (*Agentes*, *Tareas*, *Sistema*) y marcar notificaciones como leídas en lote.
