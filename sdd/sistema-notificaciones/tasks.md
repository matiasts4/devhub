# Implementation Tasks: Sistema de Notificaciones & Presence Engine Integration

## Phase 1: Core Event Engine & Notification Store

- [ ] **Task 1.1**: Crear el gestor central `src/lib/notifications/notificationManager.js`
  - Implementar métodos de publicación (`publish`), lectura (`getNotifications`), marcado de leídos (`markAsRead`, `markAllAsRead`) y eliminación.
  - Añadir soporte para almacenamiento persistente en `localStorage` / `IndexedDB` con clave `devhub:notifications:v2`.
- [ ] **Task 1.2**: Implementar el algoritmo de deduplicación y consolidación de eventos
  - Generar llaves `dedupe_key` dinámicas (ej: `presence:stalled:<agent_id>`).
  - Implementar consolidación por `occurrence_count` dentro de la ventana de enfriamiento (60 segundos).
  - Añadir política de retención automática (limpieza de notificaciones > 7 días o > 200 items).
- [ ] **Task 1.3**: Crear tests unitarios para `notificationManager.js`
  - Verificar ordenamiento por timestamp, deduplicación de llaves repetidas y contador de no leídos (`unreadCount`).

---

## Phase 2: Agent Presence & Activity Monitoring Integration

- [ ] **Task 2.1**: Implementar el listener de presencia de agentes `src/lib/notifications/presenceNotifier.js`
  - Conectar los eventos provenientes de `devhub-bus` y el motor de leases.
  - Monitorear transiciones de estado de agentes (`idle` -> `running` -> `stalled` / `failed` -> `completed`).
- [ ] **Task 2.2**: Implementar el monitor de latidos (Heartbeat Timeout Detector)
  - Configurar un temporizador en segundo plano que identifique agentes en `RUNNING` sin latido por > 30s (`STALLED`) o > 60s (`FAILED`).
  - Publicar automáticamente notificaciones con severidad `warning` o `critical` según corresponda.
- [ ] **Task 2.3**: Integrar eventos de deadlines de tareas y salud del sistema
  - Conectar el verificador de tareas próximas a vencer (vencimiento < 24h) al `notificationManager`.
  - Conectar alertas del `HealthCenter` / API `/api/agenthub/operations/health`.

---

## Phase 3: Frontend Refactoring & UI Components

- [ ] **Task 3.1**: Refactorizar `src/components/NotificationCenter.jsx`
  - Rediseñar el panel desplegable con pestañas por categoría (*Todos*, *Agentes & Swarm*, *Tareas*, *Sistema*).
  - Añadir indicador de badge dinámico en la barra superior (topbar) y en el botón del sidebar.
  - Agregar botones de acción rápida dentro de cada tarjeta de notificación ("Ver Agente", "Ir a Tarea").
- [ ] **Task 3.2**: Crear el componente flotante `src/components/NotificationToastStack.jsx`
  - Implementar el contenedor de alertas flotantes en la esquina inferior derecha.
  - Añadir animaciones de entrada/salida y barra de progreso de auto-dismiss (6s).
  - Soporte para pausar temporizador al pasar el puntero (`pauseOnHover`).
- [ ] **Task 3.3**: Integrar `NotificationToastStack` en la raíz de la aplicación (`src/App.js`)
  - Asegurar la visibilidad global de las notificaciones emergentes en cualquier sección de DevHub.

---

## Phase 4: Native OS Desktop, Audio & External Channels

- [ ] **Task 4.1**: Implementar el módulo de sintetizador de audio `src/lib/notifications/soundEffects.js`
  - Crear tonos sintéticos sutiles usando Web Audio API para severidades `warning` y `critical`.
- [ ] **Task 4.2**: Integrar notificaciones nativas del SO (Tauri / Web Notification API)
  - Detectar si la aplicación se encuentra en segundo plano (`document.hidden`).
  - Disparar notificaciones nativas de SO con icono y mensaje correspondiente cuando la ventana no tenga foco.
- [ ] **Task 4.3**: Integrar con el Telegram Bridge (`telegram-bot / bridge`)
  - Permitir el reenvío de notificaciones de severidad `critical` (como agentes con fallos catastróficos) hacia el bot de Telegram configurado.

---

## Phase 5: Preferences Modal & System Verification

- [ ] **Task 5.1**: Crear el modal de ajustes `src/components/NotificationSettingsModal.jsx`
  - Implementar toggles para habilitar/deshabilitar Toasts in-app, Notificaciones nativas de SO, Sonido y Telegram.
  - Añadir configuración de Modo No Molestar (*Quiet Hours*) y filtro de severidad mínima.
- [ ] **Task 5.2**: Pruebas de integración E2E y verificación de rendimiento
  - Simular desconexión de agentes y verificar la generación de alertas sin afectar el rendimiento de la UI (0 lag en render).
  - Ejecutar suite de pruebas de UI y verificar paridad en modo oscuro/claro.
