# Propuesta: Control Remoto por Telegram

## Intent

Crear un bot de Telegram que funcione como control remoto para orquestar DevHub desde el celular, permitiendo consultar estado del proyecto, gestionar tareas y **disparar agentes OpenCode automáticamente** sin necesidad de estar frente a la computadora.

## Problem

Actualmente DevHub solo se puede operar desde la UI web/desktop o directamente desde la terminal con OpenCode. No existe ningún mecanismo para interactuar con el sistema de forma remota desde un dispositivo móvil.

## Scope

### In Scope (Fase 1)

- Bot de Telegram con long polling (sin webhook, sin servidor externo)
- Comandos de consulta: estado, tareas, progreso, agentes
- Comandos de acción: pausar/reanudar agentes, obtener próxima tarea
- **Disparo automático de agentes via `POST /api/agents/launch`**
- Proceso Node.js independiente (`telegram-bot/`)
- Integración directa con SQLite local (`localDb.js`)
- Integración con API REST de Next.js (`/api/agents/launch`, `/api/agents/profiles`)
- Documentación de instalación y configuración
- Systemd service para inicio automático

### Out of Scope (Fase 1)

- WhatsApp, Discord u otras plataformas
- Autenticación multi-usuario (solo el owner)
- UI web para el bot
- Respuestas con imágenes o archivos
- Streaming en tiempo real del output del agente
- Migración del MCP server de Supabase a SQLite (cambio separado)

### Future (Fase 2+)

- Inline keyboards para interacción rica
- Notificaciones push al celular cuando un agente termina
- Soporte multi-usuario con permisos
- Acceso a memoria del agente (`agent_memory`)
- Comentarios de tareas desde el bot

## Approach

### Arquitectura

```
┌──────────────────────────────────────────────────────────┐
│                    TU PC (Kali Linux)                     │
│                                                           │
│  ┌───────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐ │
│  │ Next.js   │  │ Sidecar  │  │ Realtime │  │Telegram │ │
│  │  (:3000)  │  │  (:4000) │  │  (:3401) │  │  Bot    │ │
│  │           │  │          │  │          │  │         │ │
│  │ /api/     │  │ PTY/WS   │  │ chokidar │  │ Polling │ │
│  │ agents/   │  │ terminal │  │ fs watch │  │ SQLite  │ │
│  │ launch ◄──┼──┼──────────┼──┼──────────┼──┼─ API    │ │
│  └─────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬────┘ │
│        │              │             │              │      │
│        └──────────────┴─────────────┘──────────────┘      │
│                           ▼                               │
│                  ┌──────────────┐                         │
│                  │  SQLite DB   │  data/devhub.db         │
│                  │  (localDb.js)│                         │
│                  └──────────────┘                         │
└──────────────────────────────────────────────────────────┘
                  ▲
                  │ HTTPS (long polling)
                  ▼
         ┌──────────────────┐
         │  Telegram Cloud  │
         │  (Bot API)       │
         └──────────────────┘
                  ▲
                  │ Mensajes
                  ▼
         ┌──────────────────┐
         │   Tu Celular     │
         │   (Telegram App) │
         └──────────────────┘
```

### ¿Por qué proceso independiente?

1. **Separación de responsabilidades**: El sidecar maneja PTY/terminal, el bot maneja mensajería
2. **Resiliencia**: Si uno crashea, el otro sigue funcionando
3. **Dependencias aisladas**: Solo necesita `node-telegram-bot-api` + `better-sqlite3`
4. **Puede ser gestionado por systemd** para arranque automático

### ¿Por qué polling y no webhook?

- No requiere exponer puertos al internet
- No necesita ngrok, Cloudflare Tunnel, ni servidor intermedio
- Tu PC solo necesita estar encendida y conectada a internet
- Telegram maneja el queue de mensajes automáticamente

### Tablas SQLite necesarias

Las tablas actuales de SQLite (`data/devhub.db`) cubren el 95% de lo necesario:

| Tabla               | Estado    | Necesaria para bot          |
| ------------------- | --------- | --------------------------- |
| `projects`          | ✅ Existe | Sí                          |
| `tasks`             | ✅ Existe | Sí                          |
| `milestones`        | ✅ Existe | Sí                          |
| `agent_registry`    | ✅ Existe | Sí                          |
| `task_dependencies` | ✅ Existe | Sí                          |
| `profiles`          | ✅ Existe | Sí (para launch de agentes) |
| `task_comments`     | ❌ Falta  | No (Fase 2)                 |
| `agent_memory`      | ❌ Falta  | No (Fase 2)                 |
| `project_files`     | ❌ Falta  | No                          |
| `event_log`         | ❌ Falta  | No                          |

### API de Next.js — Reutilización

El bot utiliza las API routes existentes de Next.js:

| Endpoint                         | Uso del bot                       |
| -------------------------------- | --------------------------------- |
| `POST /api/agents/launch`        | Disparar agente con tarea         |
| `GET /api/agents/profiles`       | Listar perfiles disponibles       |
| `GET /api/opencode/sessions`     | Ver sesiones activas de OpenCode  |
| `POST /api/agent/execute`        | Preparar ejecución (rama, estado) |
| `POST /api/agent/prompt-builder` | Construir prompt para tarea       |
| `POST /api/agent/qa-result`      | Procesar resultado de QA          |

### Capa de datos — Acceso dual

El bot accede a datos de dos formas:

1. **SQLite directo** (`localDb.js`): Para consultas de lectura/escritura simples (estado, tareas, agentes)
2. **HTTP a Next.js** (`localhost:3000`): Para acciones complejas que requieren spawn de procesos (launch de agentes)

## Risks

| Riesgo                                             | Impacto | Mitigación                                                          |
| -------------------------------------------------- | ------- | ------------------------------------------------------------------- |
| PC apagada = bot caído                             | Alto    | Es la premisa aceptada; Fase 2 podría usar VPS                      |
| Next.js no corriendo = no se pueden lanzar agentes | Alto    | El bot verifica health de Next.js antes de launch                   |
| Token del bot expuesto                             | Medio   | Guardar en `.env`, no commitear                                     |
| Polling excesivo                                   | Bajo    | Intervalo configurable (default 2s)                                 |
| SQLite locked por escritura concurrente            | Bajo    | `busy_timeout = 5000` ya configurado                                |
| Agente spawnado no se puede matar desde el bot     | Medio   | Se puede borrar del registry; el proceso se mata al cerrar terminal |

## Dependencies

- `node-telegram-bot-api` (única dependencia nueva)
- `better-sqlite3` (ya existe en `package.json`)
- `dotenv` (ya existe en el proyecto)
- Telegram Bot Token (gratis via @BotFather)
- PC encendida con conexión a internet
- **Next.js corriendo** (para launch de agentes)
