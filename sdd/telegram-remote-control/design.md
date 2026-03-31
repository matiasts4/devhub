# Diseño Técnico: Control Remoto por Telegram

## 1. Visión General

Un proceso Node.js independiente (`telegram-bot/`) que hace long polling a la API de Telegram, interpreta comandos del usuario, consulta la base de datos SQLite local de DevHub, y puede **disparar agentes OpenCode automáticamente** via `POST /api/agents/launch`.

## 2. Arquitectura de Componentes

```
┌─────────────────────────────────────────────────────────────┐
│                    TU PC (Kali Linux)                        │
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │   Next.js    │  │   Sidecar    │  │   Telegram Bot   │   │
│  │  (:3000)     │  │   (:4000)    │  │   (node bot.js)  │   │
│  │              │  │              │  │                  │   │
│  │  /api/agents/│  │  PTY/WS      │  │  Polling Telegram│   │
│  │  launch  ◄───┼──┼──────────────┼──┼── SQLite directo │   │
│  │  /api/agent/ │  │  Terminal    │  │  HTTP a Next.js  │   │
│  │  execute     │  │              │  │                  │   │
│  │  /api/agent/ │  │              │  │                  │   │
│  │  prompt-bld  │  │              │  │                  │   │
│  │  /api/agent/ │  │              │  │                  │   │
│  │  qa-result   │  │              │  │                  │   │
│  │  /api/db/*   │  │              │  │                  │   │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘   │
│         │                 │                    │             │
│         └────────┬────────┘────────────────────┘             │
│                  ▼                                            │
│         ┌──────────────┐                                     │
│         │  SQLite DB   │  data/devhub.db                     │
│         │  (localDb.js)│                                     │
│         └──────────────┘                                     │
└─────────────────────────────────────────────────────────────┘
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

## 3. Estructura de Archivos

```
telegram-bot/
├── package.json              # Dependencias del bot
├── .env                      # TELEGRAM_BOT_TOKEN, ALLOWED_USER_IDS, NEXT_JS_URL
├── .env.example              # Template sin valores sensibles
├── .gitignore                # .env, node_modules
├── bot.js                    # Entry point — inicialización y polling loop
├── commands/
│   ├── index.js              # Registro de todos los comandos
│   ├── estado.js             # /estado — Dashboard global
│   ├── tareas.js             # /tareas [proyecto] — Lista de tareas
│   ├── progreso.js           # /progreso [proyecto] — % avance
│   ├── agentes.js            # /agentes — Estado del swarm
│   ├── pausar.js             # /pausar [agente] — Pausar agente
│   ├── reanudar.js           # /reanudar [agente] — Reanudar agente
│   ├── continuar.js          # /continuar [proyecto] — Next task + launch
│   ├── spawn.js              # /spawn [tarea] [perfil] — Lanzar agente específico
│   ├── sesiones.js           # /sesiones — Sesiones activas de OpenCode
│   └── help.js               # /help — Lista de comandos
├── services/
│   ├── db.js                 # Capa de datos SQLite (wrapper de localDb)
│   ├── api.js                # HTTP client para Next.js API routes
│   ├── formatter.js          # Formateo de mensajes para Telegram (Markdown)
│   └── auth.js               # Verificación de usuario permitido
├── utils/
│   └── logger.js             # Logger simple con timestamps
└── README.md                 # Documentación de instalación
```

## 4. Flujo de Datos por Comando

### 4.1 Comandos de Consulta (Read-only)

```
Usuario → /estado
  → bot.js recibe mensaje
    → auth.js verifica chat.id permitido
      → services/db.js consulta SQLite (projects + tasks + milestones)
        → services/formatter.js formatea respuesta Markdown
          → Telegram API responde al usuario
```

### 4.2 Comandos de Acción Simple (Write a SQLite)

```
Usuario → /pausar
  → bot.js recibe mensaje
    → auth.js verifica chat.id permitido
      → services/db.js UPDATE agent_registry SET status='paused'
        → services/formatter.js confirma acción
          → Telegram API responde al usuario
```

### 4.3 Comando /continuar (Complejo — Next task + Launch)

```
Usuario → /continuar devhub
  → bot.js recibe mensaje
    → auth.js verifica chat.id permitido
      → services/db.js calcula next task (mismo scoring que get_next_task del MCP)
        → services/api.js POST /api/agent/execute { task_id, agent_id }
          → services/api.js POST /api/agent/prompt-builder { task_id, agent_id }
            → services/api.js POST /api/agents/launch { task: prompt, profileName, projectId }
              → services/formatter.js responde: "🚀 Agente lanzado para: [tarea]"
```

### 4.4 Comando /spawn (Directo — Sin scoring)

```
Usuario → /spawn "Implementar auth JWT" default
  → bot.js recibe mensaje
    → auth.js verifica chat.id permitido
      → services/api.js GET /api/agents/profiles (valida perfil)
        → services/api.js POST /api/agents/launch { task: "Implementar auth JWT", profileName: "default" }
          → services/formatter.js responde: "🚀 Agente lanzado"
```

## 5. Capa de Datos — `services/db.js`

El bot necesita acceso directo a SQLite. Se crea un wrapper que reutiliza la lógica de `src/lib/db/localDb.js` pero adaptada para uso fuera de Next.js (CommonJS, sin dependencias de Next):

```javascript
// telegram-bot/services/db.js
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.resolve(__dirname, '../../data/devhub.db');

function getDb() {
  const db = new Database(DB_PATH, {
    fileMustExist: false,
    readonly: false,
  });
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  return db;
}

const db = {
  // ─── Dashboard ───────────────────────────────────────────────────
  getDashboard() {
    const db = getDb();
    const projects = db.prepare('SELECT * FROM projects WHERE status = ?').all('active');
    return projects.map((p) => {
      const tasks = db.prepare('SELECT * FROM tasks WHERE project_id = ?').all(p.id);
      const milestones = db
        .prepare(
          "SELECT * FROM milestones WHERE project_id = ? AND status != 'completed' ORDER BY due_date ASC LIMIT 1"
        )
        .get(p.id);
      return {
        ...p,
        tasks: {
          total: tasks.length,
          completed: tasks.filter((t) => t.status === 'completed').length,
          in_progress: tasks.filter((t) => t.status === 'in_progress').length,
          blocked: tasks.filter((t) => t.status === 'blocked').length,
        },
        next_milestone: milestones || null,
      };
    });
  },

  // ─── Tareas ──────────────────────────────────────────────────────
  getTasks(projectId, { status = ['pending', 'in_progress'], limit = 10 } = {}) {
    const db = getDb();
    const placeholders = status.map(() => '?').join(', ');
    return db
      .prepare(
        `SELECT * FROM tasks WHERE project_id = ? AND status IN (${placeholders}) ORDER BY priority DESC, created_at ASC LIMIT ?`
      )
      .all(projectId, ...status, limit);
  },

  // ─── Progreso ────────────────────────────────────────────────────
  getProgress(projectId) {
    const db = getDb();
    const total = db
      .prepare('SELECT COUNT(*) as count FROM tasks WHERE project_id = ?')
      .get(projectId);
    const completed = db
      .prepare("SELECT COUNT(*) as count FROM tasks WHERE project_id = ? AND status = 'completed'")
      .get(projectId);
    const currentMilestone = db
      .prepare(
        "SELECT * FROM milestones WHERE project_id = ? AND status = 'in_progress' ORDER BY due_date ASC LIMIT 1"
      )
      .get(projectId);
    return {
      total: total.count,
      completed: completed.count,
      percentage: total.count > 0 ? Math.round((completed.count / total.count) * 100) : 0,
      current_milestone: currentMilestone || null,
    };
  },

  // ─── Agentes ─────────────────────────────────────────────────────
  getAgents() {
    const db = getDb();
    return db.prepare('SELECT * FROM agent_registry ORDER BY last_heartbeat DESC').all();
  },

  // ─── Next Task (scoring) ─────────────────────────────────────────
  getNextTask(projectId) {
    const db = getDb();
    const tasks = db
      .prepare("SELECT * FROM tasks WHERE project_id = ? AND status = 'pending'")
      .all(projectId);

    if (!tasks.length) return null;

    // Obtener dependencias
    const taskIds = tasks.map((t) => t.id);
    const placeholders = taskIds.map(() => '?').join(', ');
    const deps = db
      .prepare(`SELECT * FROM task_dependencies WHERE task_id IN (${placeholders})`)
      .all(...taskIds);

    const priorityMap = { critical: 4, high: 3, medium: 2, low: 1 };

    let bestTask = null;
    let maxScore = -1;

    for (const task of tasks) {
      // Verificar dependencias bloqueantes
      const taskDeps = deps.filter((d) => d.task_id === task.id);
      const isBlocked = taskDeps.some((d) => {
        const depStatus = db.prepare('SELECT status FROM tasks WHERE id = ?').get(d.depends_on);
        return d.tipo === 'blocks' && depStatus?.status !== 'completed';
      });
      if (isBlocked) continue;

      const urgencia = priorityMap[task.priority] || 2;
      const valorNegocio = task.business_value || 5;
      const depsUnlock = db
        .prepare('SELECT COUNT(*) as count FROM task_dependencies WHERE depends_on = ?')
        .get(task.id).count;

      const score = urgencia * 0.4 + valorNegocio * 0.3 + depsUnlock * 0.2;

      if (score > maxScore) {
        maxScore = score;
        bestTask = task;
      }
    }

    return bestTask;
  },

  // ─── Acciones de Agentes ─────────────────────────────────────────
  pauseAgent(agentId) {
    const db = getDb();
    return db
      .prepare("UPDATE agent_registry SET status = 'paused' WHERE agent_id = ?")
      .run(agentId);
  },

  resumeAgent(agentId) {
    const db = getDb();
    return db.prepare("UPDATE agent_registry SET status = 'idle' WHERE agent_id = ?").run(agentId);
  },

  updateTaskStatus(taskId, status) {
    const db = getDb();
    const updates = { status };
    if (status === 'completed') updates.completed_at = new Date().toISOString();
    const keys = Object.keys(updates);
    const setClause = keys.map((k) => `${k} = ?`).join(', ');
    return db
      .prepare(`UPDATE tasks SET ${setClause} WHERE id = ?`)
      .run(...keys.map((k) => updates[k]), taskId);
  },

  // ─── Utilidades ──────────────────────────────────────────────────
  getProjectByName(nameOrId) {
    const db = getDb();
    // Try exact ID match first, then name LIKE
    let project = db.prepare('SELECT * FROM projects WHERE id = ?').get(nameOrId);
    if (!project) {
      project = db.prepare('SELECT * FROM projects WHERE name LIKE ?').get(`%${nameOrId}%`);
    }
    return project;
  },

  getActiveProjects() {
    const db = getDb();
    return db.prepare("SELECT * FROM projects WHERE status = 'active'").all();
  },
};

module.exports = db;
```

**Nota importante**: Cada operación abre y cierra la conexión SQLite. Esto es seguro porque `better-sqlite3` es síncrono y el WAL mode permite lecturas concurrentes. El `busy_timeout = 5000` maneja locks de escritura.

## 6. Capa HTTP — `services/api.js`

Para interactuar con las API routes de Next.js (launch de agentes, perfiles, sesiones):

```javascript
// telegram-bot/services/api.js
const NEXT_JS_URL = process.env.NEXT_JS_URL || 'http://localhost:3000';

async function api(path, options = {}) {
  const url = `${NEXT_JS_URL}${path}`;
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

const apiService = {
  // Verificar que Next.js está corriendo
  async health() {
    return api('/api/db/query?table=projects&limit=1');
  },

  // Listar perfiles de Gemini CLI disponibles
  async getProfiles() {
    return api('/api/agents/profiles');
  },

  // Ver sesiones activas de OpenCode
  async getSessions() {
    return api('/api/opencode/sessions');
  },

  // Preparar ejecución de agente (asigna tarea, crea rama)
  async executeAgent({ taskId, agentId, llmProvider, llmModel }) {
    return api('/api/agent/execute', {
      method: 'POST',
      body: JSON.stringify({
        task_id: taskId,
        agent_id: agentId,
        llm_provider: llmProvider,
        llm_model: llmModel,
      }),
    });
  },

  // Construir prompt completo para una tarea
  async buildPrompt({ taskId, agentId }) {
    return api('/api/agent/prompt-builder', {
      method: 'POST',
      body: JSON.stringify({ task_id: taskId, agent_id: agentId }),
    });
  },

  // Lanzar agente OpenCode (spawn detached)
  async launchAgent({ task, profileName, projectId }) {
    return api('/api/agents/launch', {
      method: 'POST',
      body: JSON.stringify({ task, profileName, projectId }),
    });
  },

  // Procesar resultado de QA
  async qaResult({ taskId, result, reasons, branchName }) {
    return api('/api/agent/qa-result', {
      method: 'POST',
      body: JSON.stringify({ task_id: taskId, result, reasons, branch_name: branchName }),
    });
  },
};

module.exports = apiService;
```

## 7. Autenticación

Simple: el bot verifica que el `chat.id` del mensaje coincida con los `ALLOWED_USER_IDS` configurados en `.env`.

```javascript
// telegram-bot/services/auth.js
const ALLOWED_USERS = process.env.ALLOWED_USER_IDS.split(',').map(Number);

function isAllowed(chatId) {
  return ALLOWED_USERS.includes(chatId);
}

module.exports = { isAllowed };
```

Para obtener tu Telegram user ID: enviar un mensaje a @userinfobot.

## 8. Comandos Detallados

### `/estado`

- **Input**: Ninguno
- **Query**: `SELECT * FROM projects WHERE status = 'active'` + conteo de tareas
- **Respuesta**: Lista de proyectos activos con contadores y próximo hito

### `/tareas [proyecto]`

- **Input**: Nombre o ID del proyecto (opcional)
- **Query**: `SELECT * FROM tasks WHERE project_id = ? AND status IN ('pending', 'in_progress')`
- **Respuesta**: Lista de tareas pendientes con prioridad y estado

### `/progreso [proyecto]`

- **Input**: Nombre o ID del proyecto
- **Query**: COUNT completadas vs total
- **Respuesta**: `% completado | X/Y tareas | Hito actual: [nombre]`

### `/agentes`

- **Input**: Ninguno
- **Query**: `SELECT * FROM agent_registry ORDER BY last_heartbeat DESC`
- **Respuesta**: Lista de agentes con estado, última actividad, tarea actual

### `/pausar [agente]`

- **Input**: ID del agente (opcional, pausa todos si no se especifica)
- **Query**: `UPDATE agent_registry SET status = 'paused'`
- **Respuesta**: Confirmación

### `/reanudar [agente]`

- **Input**: ID del agente
- **Query**: `UPDATE agent_registry SET status = 'idle'`
- **Respuesta**: Confirmación

### `/continuar [proyecto]`

- **Input**: Nombre o ID del proyecto
- **Flujo completo**:
  1. Calcula next task con scoring (SQLite)
  2. `POST /api/agent/execute` → asigna tarea, crea rama git
  3. `POST /api/agent/prompt-builder` → construye prompt con contexto
  4. `POST /api/agents/launch` → spawnea `opencode --task "..."`
- **Respuesta**: `"🚀 Agente lanzado para: [tarea]. Perfil: [perfil]."`

### `/spawn [tarea] [perfil]`

- **Input**: Descripción de tarea + nombre de perfil
- **Flujo**: `POST /api/agents/launch` directamente
- **Respuesta**: `"🚀 Agente lanzado con tarea personalizada."`

### `/sesiones`

- **Input**: Ninguno
- **Query**: `GET /api/opencode/sessions`
- **Respuesta**: Lista de sesiones activas de OpenCode

### `/help`

- **Input**: Ninguno
- **Respuesta**: Lista de comandos con descripción

## 9. Formato de Mensajes

Telegram soporta Markdown. Se usa este formato:

```markdown
_📊 DevHub — Estado_

🔵 _devhub_ — 100%
✅ 80/80 tareas | 🟡 0 en progreso
📍 Hito: [DESKTOP-4] Empaquetado Linux

🟢 _veloce_ — 0%
⏳ 0/7 tareas | 🔴 7 overdue
📍 Hito: Fase 1: Punto de Restauración
```

## 10. Entry Point — `bot.js`

```javascript
// telegram-bot/bot.js
require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });

const TelegramBot = require('node-telegram-bot-api');
const { isAllowed } = require('./services/auth');
const commands = require('./commands');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN no configurado en .env');
  process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Middleware de autenticación
bot.on('message', (msg) => {
  if (!isAllowed(msg.chat.id)) {
    bot.sendMessage(msg.chat.id, '⛔ Acceso no autorizado.');
    return;
  }
});

// Registrar comandos
const commandHandlers = [
  { cmd: 'estado', handler: commands.estado },
  { cmd: 'tareas', handler: commands.tareas },
  { cmd: 'progreso', handler: commands.progreso },
  { cmd: 'agentes', handler: commands.agentes },
  { cmd: 'pausar', handler: commands.pausar },
  { cmd: 'reanudar', handler: commands.reanudar },
  { cmd: 'continuar', handler: commands.continuar },
  { cmd: 'spawn', handler: commands.spawn },
  { cmd: 'sesiones', handler: commands.sesiones },
  { cmd: 'help', handler: commands.help },
];

commandHandlers.forEach(({ cmd, handler }) => {
  bot.onText(new RegExp(`^/${cmd}(.*)`), (msg, match) => {
    if (!isAllowed(msg.chat.id)) return;
    const args = match[1].trim();
    handler(bot, msg, args).catch((err) => {
      console.error(`Error en /${cmd}:`, err.message);
      bot.sendMessage(msg.chat.id, `❌ Error: ${err.message}`);
    });
  });
});

console.log('✅ DevHub Telegram Bot iniciado');
console.log(`   Polling activo — esperando comandos...`);
```

## 11. Proceso de Inicio

### Instalación manual

```bash
cd telegram-bot
npm install
cp .env.example .env
# Editar .env con TELEGRAM_BOT_TOKEN y ALLOWED_USER_IDS
node bot.js
```

### Systemd service (recomendado)

```ini
# /etc/systemd/system/devhub-telegram-bot.service
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
Environment=PATH=/usr/bin:/usr/local/bin

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable devhub-telegram-bot
sudo systemctl start devhub-telegram-bot
sudo systemctl status devhub-telegram-bot
```

## 12. Decisiones de Diseño

### D1: Proceso independiente vs integrado en sidecar

**Decisión**: Proceso independiente (`telegram-bot/`)
**Razón**: Separación de responsabilidades. El sidecar maneja PTY de alta latencia, el bot es I/O liviano con polling. Si uno crashea, el otro sigue.

### D2: Acceso directo a SQLite vs vía MCP

**Decisión**: Acceso directo a SQLite
**Razón**: El MCP server usa Supabase actualmente. Migrarlo a SQLite es trabajo adicional que no aporta valor al bot. El bot lee SQLite directamente con `better-sqlite3` (ya es dependencia del proyecto).

### D3: Polling vs Webhook

**Decisión**: Long polling
**Razón**: No requiere exponer puertos, ni ngrok, ni servidor intermedio. Tu PC solo necesita estar encendida y conectada a internet.

### D4: Framework de bot

**Decisión**: `node-telegram-bot-api`
**Razón**: Librería más madura y simple para bots de Telegram en Node.js. Soporta polling nativamente. ~50KB.

### D5: Doble capa de datos (SQLite + HTTP)

**Decisión**: SQLite directo para consultas, HTTP a Next.js para acciones complejas
**Razón**: Las consultas de lectura/escritura simples (estado, tareas, agentes) son más eficientes directo a SQLite. Las acciones complejas (launch de agentes) requieren spawn de procesos que solo Next.js puede hacer.

### D6: Sincrónico vs Asíncrono para SQLite

**Decisión**: Sincrónico (better-sqlite3)
**Razón**: Las operaciones del bot son interactivas (un comando a la vez). No hay necesidad de async. better-sqlite3 es más simple y performante para este caso de uso.

## 13. Tablas SQLite — Estado Actual vs Necesario

### Tablas existentes ✅ (todas necesarias para el bot)

- `projects` — Completa
- `tasks` — Completa (incluye `assigned_to`, `business_value`, `stale_alert`)
- `milestones` — Completa
- `agent_registry` — Completa (incluye `current_task_id`, `error_message`)
- `task_dependencies` — Completa
- `profiles` — Completa (necesaria para launch de agentes)

### Tablas faltantes ❌ (no bloquean Fase 1)

- `task_comments` — Para Fase 2 (ver comentarios de tareas desde el bot)
- `agent_memory` — Para Fase 2 (buscar memorias desde el bot)
- `project_files` — No necesaria para el bot
- `event_log` — Para Fase 2 (historial de actividad)

## 14. MCP Server — Migración a SQLite (separado del bot)

El MCP server (`devhub-mcp/server.js`) actualmente usa `@supabase/supabase-js`. Esto debería migrarse a SQLite para consistencia, pero es un cambio **separado** del bot de Telegram.

**Impacto en el bot**: Ninguno. El bot accede a SQLite directamente y a las API routes de Next.js.

**Nota**: 25 de las 32 herramientas MCP apuntan a Supabase. Esta migración debería hacerse como un cambio paralelo.
