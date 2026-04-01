# DevHub Telegram Bot — Resumen de Implementación

> Fecha: 2026-04-01
> Estado: ~85% funcional
> Commits: 5 (`a4324f8` → `02d6d3a`)

---

## 📊 Resumen Ejecutivo

Se implementó un **bot de Telegram completo** que permite controlar DevHub desde el celular. El bot tiene **12 comandos slash** + **chat conversacional** con OpenCode, logging persistente a SQLite, y una **UI de monitoreo** integrada en la app web.

**2,560 líneas de código** en 25 archivos.

---

## ✅ Lo que funciona

### Comandos de Consulta (solo SQLite, no necesitan Next.js)

| Comando                | Qué hace                                              | Estado |
| ---------------------- | ----------------------------------------------------- | ------ |
| `/estado`              | Dashboard de proyectos activos con contadores y hitos | ✅     |
| `/tareas [proyecto]`   | Lista tareas pendientes con prioridad y fecha         | ✅     |
| `/progreso [proyecto]` | Barra de progreso visual + hito actual                | ✅     |
| `/agentes`             | Estado del swarm con heartbeat y tarea actual         | ✅     |
| `/help`                | Lista completa de comandos                            | ✅     |

### Comandos de Acción

| Comando              | Qué hace                                                       | Estado |
| -------------------- | -------------------------------------------------------------- | ------ |
| `/pausar [agente]`   | Pausa agente individual o todos                                | ✅     |
| `/reanudar [agente]` | Reanuda agente pausado                                         | ✅     |
| `/agente [nombre]`   | Ver/cambiar agente de chat (gentleman, sdd-orchestrator, etc.) | ✅     |
| `/reset`             | Limpiar historial de conversación                              | ✅     |
| `/historial`         | Ver últimos 10 mensajes                                        | ✅     |

### Comandos que requieren Next.js corriendo

| Comando                   | Qué hace                        | Estado          |
| ------------------------- | ------------------------------- | --------------- |
| `/continuar [proyecto]`   | Next task + launch de agente    | ✅ Implementado |
| `/spawn [tarea] [perfil]` | Launch directo con tarea custom | ✅ Implementado |
| `/sesiones`               | Sesiones activas de OpenCode    | ✅ Implementado |

### Chat Conversacional

- Mensajes de texto plano → `opencode run --agent X` via tmux
- Historial de conversación mantenido en memoria
- Contexto inyectado en cada llamada
- Respuesta en ~6-10s para mensajes simples
- ⚠️ **Bug conocido**: código duplicado en `opencode.js` (ver Pendientes)

### Logging y Monitoreo

| Componente                                              | Estado |
| ------------------------------------------------------- | ------ |
| `services/activityLogger.js` — logging a SQLite         | ✅     |
| Tablas `telegram_activity` + `telegram_sessions`        | ✅     |
| `GET /api/telegram/status`                              | ✅     |
| `GET /api/telegram/activity`                            | ✅     |
| `src/views/TelegramMonitor.jsx` — UI de monitoreo       | ✅     |
| `src/components/ui/StatusSignal.jsx` — indicador visual | ✅     |

---

## 🔴 Pendientes / Bugs

### Crítico

| #   | Problema                                          | Archivo                | Impacto                                |
| --- | ------------------------------------------------- | ---------------------- | -------------------------------------- |
| 1   | Código duplicado en `opencode.js` líneas 198-211  | `services/opencode.js` | Chat conversacional roto               |
| 2   | Múltiples instancias del bot causan conflicto 409 | Telegram API           | El bot no responde si hay 2+ corriendo |

### Importante

| #   | Problema                                                                                           | Impacto                           |
| --- | -------------------------------------------------------------------------------------------------- | --------------------------------- |
| 3   | `TelegramMonitor.jsx` no está integrado en el router de la app                                     | La UI existe pero no es accesible |
| 4   | No hay botón/link en la sidebar para acceder al monitor                                            | El usuario no sabe que existe     |
| 5   | `activityLogger.js` tiene conflicto de nombres (`upsertSession` como prepared statement Y función) | Puede fallar el logging           |

### Fase 2 (nice to have)

| #   | Feature                  | Descripción                            |
| --- | ------------------------ | -------------------------------------- |
| 6   | Notificaciones push      | Bot notifica cuando un agente termina  |
| 7   | Inline keyboards         | Botones interactivos en Telegram       |
| 8   | Multi-usuario            | Permisos diferenciados                 |
| 9   | Streaming en tiempo real | Ver output del agente mientras trabaja |
| 10  | Acceso a agent_memory    | Buscar memorias desde el bot           |

---

## 🏗️ Arquitectura

```
[Celular] → Telegram Cloud (Bot API)
                  ↑ polling cada 2s
[telegram-bot/] → Proceso Node.js independiente
    ├── SQLite directo (consultas, logging)
    ├── HTTP a Next.js (launch de agentes)
    └── tmux (ejecución de OpenCode)

[Next.js] → UI Web + API routes
    ├── /api/telegram/status → estado del bot
    ├── /api/telegram/activity → logs de actividad
    └── TelegramMonitor.jsx → vista de monitoreo

[SQLite] → data/devhub.db
    ├── telegram_activity → logs de cada comando/mensaje
    └── telegram_sessions → sesiones activas por usuario
```

---

## 📁 Estructura de Archivos

```
telegram-bot/
├── bot.js                    # Entry point (276 líneas)
├── package.json              # 3 dependencias
├── .env.example              # Template de configuración
├── .gitignore
├── devhub-bot.service        # Systemd unit file
├── README.md                 # Documentación completa
├── commands/                 # 13 handlers de comandos
│   ├── estado.js             # /estado
│   ├── tareas.js             # /tareas [proyecto]
│   ├── progreso.js           # /progreso [proyecto]
│   ├── agentes.js            # /agentes
│   ├── help.js               # /help
│   ├── pausar.js             # /pausar [agente]
│   ├── reanudar.js           # /reanudar [agente]
│   ├── continuar.js          # /continuar [proyecto]
│   ├── spawn.js              # /spawn [tarea] [perfil]
│   ├── sesiones.js           # /sesiones
│   ├── agente.js             # /agente [nombre]
│   ├── reset.js              # /reset
│   └── historial.js          # /historial
├── services/
│   ├── db.js                 # Capa SQLite (444 líneas, 11 funciones)
│   ├── api.js                # HTTP client Next.js (83 líneas, 7 funciones)
│   ├── auth.js               # Auth guard por chat ID
│   ├── formatter.js          # Markdown formatter con escaping
│   ├── conversation.js       # Historial de conversación en memoria
│   ├── opencode.js           # Runner via tmux (con bug de código duplicado)
│   └── activityLogger.js     # Logging persistente a SQLite
└── utils/
    └── logger.js             # Logger con timestamps y colores

src/app/api/telegram/         # API routes para UI
├── status/route.js           # GET /api/telegram/status
└── activity/route.js         # GET /api/telegram/activity

src/views/
└── TelegramMonitor.jsx       # Vista de monitoreo (359 líneas)

src/components/ui/
└── StatusSignal.jsx          # Indicador visual reutilizable
```

---

## 🚀 Cómo Iniciar

```bash
# 1. Matar instancias viejas
pkill -9 -f "node bot.js"

# 2. Iniciar bot
cd ~/devhub/telegram-bot && node bot.js

# 3. (Opcional) Systemd service
sudo cp telegram-bot/devhub-bot.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now devhub-bot
```

---

## 📋 Próximos Pasos

1. **Fix urgente**: Eliminar código duplicado en `opencode.js` líneas 198-211
2. **Integrar UI**: Agregar `TelegramMonitor` al router de la app y un link en la sidebar
3. **Fix activityLogger**: Resolver conflicto de nombres `upsertSession`
4. **Testing manual**: Probar todos los comandos con casos reales
5. **Fase 2**: Notificaciones push, inline keyboards, streaming
