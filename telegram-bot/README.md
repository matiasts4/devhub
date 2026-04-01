# DevHub Telegram Bot

> **Estado**: ~85% funcional | **Commits**: 5 | **LOC**: 2,560
>
> Bot de Telegram para controlar DevHub desde el celular.
> Consulta proyectos, gestiona agentes, y chatea con OpenCode.

---

## Instalación Rápida

```bash
cd telegram-bot
npm install
cp .env.example .env
# Editá .env con tu TELEGRAM_BOT_TOKEN y ALLOWED_USER_IDS
node bot.js
```

## Configuración

### Telegram Bot Token

1. Abrí Telegram → buscá **@BotFather**
2. Enviá `/newbot` y seguí las instrucciones
3. Copiá el token en `.env` como `TELEGRAM_BOT_TOKEN`

### Tu Telegram User ID

1. Abrí Telegram → buscá **@userinfobot**
2. Enviá `/start`
3. Copiá el ID en `.env` como `ALLOWED_USER_IDS`

### Variables de Entorno

| Variable             | Descripción                                                |
| -------------------- | ---------------------------------------------------------- |
| `TELEGRAM_BOT_TOKEN` | Token de @BotFather                                        |
| `ALLOWED_USER_IDS`   | Tu Telegram ID (solo vos podés usar el bot)                |
| `NEXT_JS_URL`        | URL del backend Next.js (default: `http://localhost:3000`) |
| `NODE_ENV`           | `production` o `development`                               |

---

## Comandos

### 💬 Chat Conversacional

Escribile **cualquier cosa** sin slash y el bot chatea con OpenCode usando el agente configurado.

```
¿Cuál es el estado del proyecto devhub?
→ El bot le pregunta a OpenCode y te responde con contexto de conversación
```

### 🔧 Gestión de Chat

| Comando            | Descripción                                                                |
| ------------------ | -------------------------------------------------------------------------- |
| `/agente [nombre]` | Ver o cambiar agente actual (gentleman, sdd-orchestrator, build, plan, qa) |
| `/reset`           | Limpiar historial de conversación                                          |
| `/historial`       | Ver últimos 10 mensajes                                                    |

### 📊 Consultas

| Comando                | Descripción                     | Ejemplo            |
| ---------------------- | ------------------------------- | ------------------ |
| `/estado`              | Dashboard de proyectos activos  | `/estado`          |
| `/tareas [proyecto]`   | Tareas pendientes con prioridad | `/tareas veloce`   |
| `/progreso [proyecto]` | Barra de progreso visual        | `/progreso devhub` |
| `/agentes`             | Estado del swarm                | `/agentes`         |

### ⚡ Acciones

| Comando                   | Descripción                  | Ejemplo                |
| ------------------------- | ---------------------------- | ---------------------- |
| `/pausar [agente]`        | Pausar agente(s)             | `/pausar`              |
| `/reanudar [agente]`      | Reanudar agente(s)           | `/reanudar`            |
| `/continuar [proyecto]`   | Next task + launch de agente | `/continuar veloce`    |
| `/spawn [tarea] [perfil]` | Launch con tarea custom      | `/spawn Fix login bug` |
| `/sesiones`               | Sesiones activas de OpenCode | `/sesiones`            |

---

## Arquitectura

```
[Celular] → Telegram Cloud (Bot API)
                  ↑ polling
[telegram-bot/] → Node.js independiente
    ├── SQLite directo (consultas, logging)
    ├── HTTP a Next.js (launch de agentes)
    └── tmux (ejecución de OpenCode con TTY real)

[SQLite] → data/devhub.db
    ├── telegram_activity → logs de cada comando
    └── telegram_sessions → sesiones activas
```

### ¿Por qué tmux?

OpenCode necesita un TTY real para funcionar. El bot usa `tmux` para crear sesiones temporales, ejecutar `opencode run`, y capturar el output cuando termina.

---

## Systemd Service

```bash
sudo cp devhub-bot.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now devhub-bot
sudo systemctl status devhub-bot
```

---

## Estado Actual

### ✅ Funcional

- 12 comandos slash (todos implementados)
- Chat conversacional con OpenCode via tmux
- Logging persistente a SQLite
- UI de monitoreo (`TelegramMonitor.jsx`)
- API routes (`/api/telegram/status`, `/api/telegram/activity`)

### ⚠️ Pendiente

- Fix bug de código duplicado en `opencode.js`
- Integrar `TelegramMonitor` en el router de la app
- Testing manual de todos los comandos
- Notificaciones push cuando un agente termina

---

## Estructura

```
telegram-bot/
├── bot.js                    # Entry point
├── commands/                 # 13 handlers
│   ├── estado, tareas, progreso, agentes, help
│   ├── pausar, reanudar, continuar, spawn, sesiones
│   └── agente, reset, historial, chat
├── services/
│   ├── db.js                 # SQLite (444 líneas)
│   ├── api.js                # HTTP client Next.js
│   ├── auth.js               # Auth guard
│   ├── formatter.js          # Markdown formatter
│   ├── conversation.js       # Historial en memoria
│   ├── opencode.js           # Runner via tmux
│   └── activityLogger.js     # Logging persistente
└── utils/
    └── logger.js             # Logger con colores
```

---

## License

MIT
