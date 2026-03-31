# DevHub Telegram Bot

A Telegram bot that lets you interact with your **DevHub** projects, tasks, and milestones directly from Telegram.

## Prerequisites

- Node.js 18+ (for `--watch` support in dev mode)
- npm

## Installation

```bash
cd telegram-bot
npm install
cp .env.example .env
```

Then edit `.env` with your actual values.

## Configuration

### Getting a Telegram Bot Token

1. Open Telegram and search for **@BotFather**
2. Send `/newbot` and follow the instructions
3. Choose a name and username for your bot
4. BotFather will give you a **token** — paste it in `.env` as `TELEGRAM_BOT_TOKEN`

### Getting Your Telegram User ID

1. Open Telegram and search for **@userinfobot**
2. Send `/start`
3. The bot will reply with your **Id** — paste it in `.env` as `ALLOWED_USER_IDS`
4. For multiple users, separate IDs with commas: `ALLOWED_USER_IDS=123456789,987654321`

### Environment Variables

| Variable             | Description                                                          |
| -------------------- | -------------------------------------------------------------------- |
| `TELEGRAM_BOT_TOKEN` | Token from @BotFather                                                |
| `ALLOWED_USER_IDS`   | Comma-separated Telegram user IDs allowed to use the bot             |
| `NEXT_JS_URL`        | URL of the DevHub Next.js backend (default: `http://localhost:3000`) |
| `NODE_ENV`           | `production` or `development`                                        |

## Running

### Development (with auto-reload)

```bash
npm run dev
```

### Production

```bash
npm start
```

### Running as a Systemd Service

1. Create a service file:

```bash
sudo nano /etc/systemd/system/devhub-bot.service
```

2. Add the following (adjust paths):

```ini
[Unit]
Description=DevHub Telegram Bot
After=network.target

[Service]
Type=simple
User=matias
WorkingDirectory=/home/matias/devhub/telegram-bot
ExecStart=/usr/bin/node bot.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

3. Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable devhub-bot
sudo systemctl start devhub-bot
```

4. Check status:

```bash
sudo systemctl status devhub-bot
```

## Available Commands

### Consultas (Read-only)

| Comando                | Descripción                              | Ejemplo            |
| ---------------------- | ---------------------------------------- | ------------------ |
| `/estado`              | Dashboard de todos los proyectos activos | `/estado`          |
| `/tareas [proyecto]`   | Lista de tareas pendientes               | `/tareas veloce`   |
| `/progreso [proyecto]` | Barra de progreso visual                 | `/progreso devhub` |
| `/agentes`             | Estado del swarm de agentes              | `/agentes`         |

### Acciones (Write/Launch)

| Comando                   | Descripción                      | Ejemplo                |
| ------------------------- | -------------------------------- | ---------------------- |
| `/pausar [agente]`        | Pausa un agente o todos          | `/pausar`              |
| `/reanudar [agente]`      | Reanuda un agente pausado        | `/reanudar`            |
| `/continuar [proyecto]`   | Obtiene next task y lanza agente | `/continuar veloce`    |
| `/spawn [tarea] [perfil]` | Lanza agente con tarea custom    | `/spawn Fix login bug` |
| `/sesiones`               | Sesiones activas de OpenCode     | `/sesiones`            |

### Ayuda

| Comando  | Descripción           |
| -------- | --------------------- |
| `/start` | Mensaje de bienvenida |
| `/help`  | Lista de comandos     |

## Project Structure

```
telegram-bot/
├── bot.js              # Main entry point
├── commands/           # Telegram command handlers
├── services/           # Business logic & API clients
├── utils/              # Helper functions
├── data/               # SQLite database (auto-created)
├── .env.example        # Environment template
├── .gitignore
├── package.json
└── README.md
```

## License

MIT
