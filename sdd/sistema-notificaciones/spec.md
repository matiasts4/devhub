# Specification: Sistema de Notificaciones & Presence Engine Integration

## Purpose

Esta especificación establece los requisitos funcionales, contratos de datos y escenarios de aceptación (GIVEN-WHEN-THEN) para el Sistema de Notificaciones de DevHub, enfocado en el monitoreo activo de presencia de agentes, tareas y eventos operacionales.

---

## Domain: Agent Presence & Activity Monitoring

### Requirement: Agent State Transition Detection

El sistema DEBE monitorear activamente los latidos (heartbeats) y los cambios de estado de los agentes registrados en el bus (`devhub-bus` / `devhub-mcp`) y generar eventos de notificación cuando un agente cambie de estado.

Los estados monitoreados incluyen:
- `IDLE`: Agente activo esperando tareas.
- `RUNNING`: Agente ejecutando un trabajo o sub-agente activo.
- `STALLED`: Agente en ejecución que no ha enviado latido por más de 30 segundos.
- `FAILED`: Agente que terminó con error o cuyo latido expiró (> 60 segundos).
- `COMPLETED`: Agente que finalizó exitosamente su tarea asignada.

#### Scenario: Agent Transitions to Stalled

- **GIVEN** un agente en estado `RUNNING` ejecutando la tarea `T-102`
- **WHEN** transcurren 30 segundos sin recibir un latido (`heartbeat`) del agente
- **THEN** el motor de presencia cambia el estado del agente a `STALLED`
- **AND** emite una notificación de severidad `warning` con el mensaje "Agente [Agent-ID] no responde (Stalled)"
- **AND** incluye la acción rápida "Ver Traza / Reintentar".

#### Scenario: Agent Transitions to Completed

- **GIVEN** un agente ejecutando una tarea de swarm en estado `RUNNING`
- **WHEN** el agente reporta finalización exitosa mediante `devhub release` o evento `task_completed`
- **THEN** el sistema genera una notificación de severidad `success` con el título "Tarea Finalizada por [Agent-ID]"
- **AND** actualiza la lista de presencia a `IDLE`.

#### Scenario: Agent Heartbeat Recovery

- **GIVEN** un agente previamente marcado como `STALLED`
- **WHEN** el agente vuelve a emitir un latido válido
- **THEN** el sistema cambia su estado a `RUNNING`
- **AND** emite una notificación informativa `info` de "Agente [Agent-ID] recuperado"
- **AND** consolida o resuelve la alerta previa de `STALLED`.

---

## Domain: Notification Lifecycle & Storage

### Requirement: Event Deduplication & Debouncing

El sistema DEBE evitar la sobrecarga de notificaciones idénticas (Notification Storm) aplicando deduplicación por clave (`dedupe_key`) y ventana de tiempo.

#### Scenario: High Frequency Heartbeat Timeouts Deduplicated

- **GIVEN** un agente cuyo proceso está bloqueado y no envía latidos
- **WHEN** se generan múltiples chequeos de fallo consecutivamente dentro de un intervalo de 60 segundos
- **THEN** el sistema crea una sola notificación inicial con la clave `presence:stalled:[agent_id]`
- **AND** incrementa el contador de repeticiones (`occurrence_count`) sin crear registros duplicados en la UI.

### Requirement: Notification Persistence & Read State

El sistema DEBE persistir las notificaciones localmente y rastrear su estado de lectura por el usuario (`unread` / `read`).

#### Scenario: Marking Single Notification as Read

- **GIVEN** una notificación no leída en el centro de notificaciones
- **WHEN** el usuario hace clic en la notificación o en el botón "Marcar como leída"
- **THEN** el campo `read_at` se actualiza con la marca de tiempo actual
- **AND** el contador total de notificaciones no leídas (`unreadCount`) se decrementa en 1 en la barra superior.

#### Scenario: Bulk Read by Category

- **GIVEN** 5 notificaciones no leídas en la categoría "Agentes & Swarm"
- **WHEN** el usuario presiona "Marcar todas como leídas en esta pestaña"
- **THEN** todas las notificaciones de esa categoría quedan marcadas con `read_at`
- **AND** el indicador de la pestaña correspondiente se limpia.

#### Scenario: Automatic Retention Cleanup

- **GIVEN** un historial de notificaciones acumuladas durante varios días
- **WHEN** la cantidad total supera los 200 registros o existen notificaciones con más de 7 días de antigüedad
- **THEN** el proceso de mantenimiento elimina automáticamente los registros más antiguos que ya hayan sido leídos.

---

## Domain: Multi-Channel Delivery Engine

### Requirement: In-App Floating Toasts

El sistema DEBE mostrar avisos emergentes (Toasts) en la esquina de la pantalla para notificaciones de severidad `warning`, `critical` y `success`.

#### Scenario: Displaying Toast with Auto-Dismiss

- **GIVEN** el usuario trabajando en la interfaz de DevHub
- **WHEN** se emite una notificación de severidad `warning`
- **THEN** el componente `NotificationToastStack` despliega un aviso emergente con animación de entrada
- **AND** el aviso permanece visible por 6 segundos antes de desvanecerse automáticamente (auto-dismiss)
- **AND** si la severidad es `critical`, el aviso permanece fijo hasta que el usuario interactúe con él.

### Requirement: Native OS Desktop Notifications

El sistema DEBE enviar notificaciones nativas del sistema operativo cuando DevHub se encuentre minimizado o en segundo plano.

#### Scenario: Trigger Native OS Notification When App is Backgrounded

- **GIVEN** la aplicación DevHub ejecutándose en segundo plano (`document.hidden === true`)
- **WHEN** se recibe una notificación de estado de agente `FAILED` o deadline vencido
- **THEN** el sistema invoca la API de notificaciones nativas de Tauri / Web Notifications
- **AND** despliega el título, mensaje e icono de la aplicación en el centro de notificaciones del SO.

### Requirement: Audio Alerts for Critical Events

El sistema DEBE reproducir una señal sonora sutil para eventos de alta prioridad si la opción está habilitada en la configuración.

#### Scenario: Critical Event Audio Cue

- **GIVEN** las notificaciones sonoras habilitadas en las preferencias del usuario
- **WHEN** se genera un evento con severidad `critical`
- **THEN** el sistema reproduce un tono sintético corto mediante Web Audio API
- **AND** respeta la configuración de volumen definida por el usuario.

---

## Domain: User Preferences & Controls

### Requirement: Granular Notification Settings

El sistema DEBE proporcionar una interfaz gráfica para personalizar qué eventos y canales activan notificaciones.

#### Scenario: Configuring Quiet Hours (Do Not Disturb)

- **GIVEN** el panel de configuración de notificaciones
- **WHEN** el usuario activa la opción "Modo No Molestar (Quiet Hours)"
- **THEN** se suprimen todos los toasts in-app y sonidos, excepto las alertas `critical` explícitas
- **AND** las notificaciones continúan registrándose silenciosamente en el `NotificationCenter`.
