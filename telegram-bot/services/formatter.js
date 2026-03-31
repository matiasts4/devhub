/**
 * Formatter service — builds Markdown-formatted Telegram messages.
 *
 * All functions return strings ready to be sent with parse_mode: 'Markdown'.
 */

// ── Helpers ────────────────────────────────────────────────────────────────

const PRIORITY_ICONS = {
  critical: '🔴',
  high: '🟠',
  medium: '🟡',
  low: '🟢',
};

const STATUS_ICONS = {
  pending: '⏳',
  in_progress: '🔄',
  completed: '✅',
  blocked: '🚫',
};

const AGENT_STATUS_ICONS = {
  working: '🟢',
  idle: '⚪',
  paused: '⏸️',
  error: '🔴',
};

/** Build a visual progress bar (20 chars). */
function progressBar(pct) {
  const filled = Math.round((pct / 100) * 20);
  const empty = 20 - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

/** Format a relative time from an ISO date or timestamp. */
function timeSince(isoString) {
  if (!isoString) return 'desconocido';
  const then = new Date(isoString).getTime();
  const now = Date.now();
  const diffMs = Math.max(0, now - then);
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'hace <1 min';
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `hace ${days}d`;
}

/** Escape characters that Telegram Markdown v1 treats specially. */
function esc(text) {
  if (text == null) return '';
  return String(text).replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
}

// ── Formatters ─────────────────────────────────────────────────────────────

/** Map common DevHub hex colors to emojis. */
function colorToEmoji(hex) {
  if (!hex) return '🔵';
  const h = hex.toLowerCase().replace('#', '');
  if (h.startsWith('58a6')) return '🔵'; // blue
  if (h.startsWith('00c8')) return '🟢'; // green
  if (h.startsWith('ff6b')) return '🟠'; // orange
  if (h.startsWith('e91e')) return '🔴'; // red
  if (h.startsWith('9c27')) return '🟣'; // purple
  return '🔵';
}

/**
 * Format dashboard response.
 * @param {Array<{name:string, progress:number, color:string, tasks:{total:number, completed:number, in_progress:number, blocked:number}, next_milestone:{title:string, id:string}}>} projects
 * @returns {string}
 */
function formatDashboard(projects) {
  if (!projects || projects.length === 0) {
    return '*📊 DevHub — Estado*\n\n_No hay proyectos registrados\\._';
  }

  const lines = ['*📊 DevHub — Estado*', ''];

  for (const p of projects) {
    const colorEmoji = colorToEmoji(p.color);
    const taskLine = `   ✅ ${p.tasks.completed || 0}/${p.tasks.total || 0} tareas | 🟡 ${p.tasks.in_progress || 0} en progreso`;
    const blockedLine = p.tasks.blocked > 0 ? ` | 🚫 ${p.tasks.blocked} bloqueadas` : '';
    const milestoneLine =
      p.next_milestone && p.next_milestone.title
        ? `   📍 Hito: ${esc(p.next_milestone.title)}`
        : '   📍 Sin hitos planificados';

    lines.push(`${colorEmoji} *${esc(p.name)}* — ${p.progress ?? 0}%`);
    lines.push(`${taskLine}${blockedLine}`);
    lines.push(milestoneLine);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Format task list.
 * @param {Array<{title:string, status:string, priority:string, due_date:string}>} tasks
 * @param {string} projectName
 * @returns {string}
 */
function formatTasks(tasks, projectName) {
  if (!tasks || tasks.length === 0) {
    return `*📋 ${esc(projectName)} — Tareas*\n\n_No hay tareas\\._`;
  }

  const lines = [`*📋 ${esc(projectName)} — Tareas*`, ''];

  for (const t of tasks) {
    const prio = PRIORITY_ICONS[t.priority] || '⚪';
    const status = STATUS_ICONS[t.status] || '⏳';
    const due = t.due_date ? ` _(${esc(t.due_date)})_` : '';
    lines.push(`${prio} ${status} ${esc(t.title)}${due}`);
  }

  return lines.join('\n');
}

/**
 * Format progress with visual bar.
 * @param {{total:number, completed:number, percentage:number}} progress
 * @param {string} projectName
 * @param {{title:string, id:string}} milestone
 * @returns {string}
 */
function formatProgress(progress, projectName, milestone) {
  const pct = progress?.percentage ?? 0;
  const bar = progressBar(pct);

  const lines = [
    `*📈 ${esc(projectName)} — Progreso*`,
    `${bar} ${pct}%`,
    `✅ ${progress?.completed ?? 0}/${progress?.total ?? 0} tareas completadas`,
  ];

  if (milestone) {
    lines.push(`📍 Hito actual: [${esc(milestone.id)}] ${esc(milestone.title)}`);
  }

  return lines.join('\n');
}

/**
 * Format agent list.
 * @param {Array<{agent_id:string, nombre:string, status:string, last_heartbeat:string, current_task_id:string, modelo_llm:string}>} agents
 * @returns {string}
 */
function formatAgents(agents) {
  if (!agents || agents.length === 0) {
    return '*🤖 Agentes*\n\n_No hay agentes registrados\\._';
  }

  const lines = ['*🤖 Agentes*', ''];

  for (const a of agents) {
    const icon = AGENT_STATUS_ICONS[a.status] || '⚪';
    const heartbeat = timeSince(a.last_heartbeat);
    const taskInfo = a.current_task_id ? ` | 📌 ${esc(a.current_task_id)}` : '';
    const model = a.modelo_llm ? ` _(${esc(a.modelo_llm)})_` : '';

    lines.push(`${icon} *${esc(a.nombre)}* \\(${esc(a.agent_id)}\\)${model}`);
    lines.push(`   ⏱ ${heartbeat}${taskInfo}`);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Format help message with all available commands.
 * @returns {string}
 */
function formatHelp() {
  const lines = [
    '*🤖 DevHub Bot — Ayuda*',
    '',
    '*💬 Chat con OpenCode:*',
    'Escribime cualquier cosa y hablo con el agente configurado',
    '',
    '*Consultas:*',
    '/estado — Dashboard de todos los proyectos',
    '/tareas \\[proyecto\\] — Tareas pendientes',
    '/progreso \\[proyecto\\] — Barra de progreso',
    '/agentes — Estado del swarm',
    '',
    '*Acciones:*',
    '/pausar \\[agente\\] — Pausar agente\\(s\\)',
    '/reanudar \\[agente\\] — Reanudar agente\\(s\\)',
    '/continuar \\[proyecto\\] — Next task \\+ lanzar agente',
    '/spawn \\[tarea\\] \\[perfil\\] — Lanzar con tarea custom',
    '/sesiones — Sesiones activas de OpenCode',
    '',
    '*Gestión de chat:*',
    '/agente \\[nombre\\] — Ver/cambiar agente actual',
    '/reset — Limpiar historial de conversación',
    '/historial — Ver últimos mensajes',
    '',
    '*Ejemplos:*',
    '`¿Cuál es el estado del proyecto devhub\\?`',
    '`/tareas veloce`',
    '`/agente sdd-orchestrator`',
    '`/continuar veloce`',
  ];
  return lines.join('\n');
}

/**
 * Format error message.
 * @param {string} message
 * @returns {string}
 */
function formatError(message) {
  return `❌ Error: ${esc(message)}`;
}

/**
 * Format success / confirmation message.
 * @param {string} message
 * @returns {string}
 */
function formatSuccess(message) {
  return `✅ ${esc(message)}`;
}

/**
 * Format launch confirmation.
 * @param {string} task
 * @param {string} agentId
 * @param {string} profileName
 * @returns {string}
 */
function formatLaunch(task, agentId, profileName) {
  return [
    '🚀 *Agente lanzado*',
    '',
    `Tarea: ${esc(task)}`,
    `Agente: ${esc(agentId)}`,
    `Perfil: ${esc(profileName)}`,
  ].join('\n');
}

// ── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  formatDashboard,
  formatTasks,
  formatProgress,
  formatAgents,
  formatHelp,
  formatError,
  formatSuccess,
  formatLaunch,
};
