#!/usr/bin/env node
// One-shot client: talks to devhub-mcp server over stdio JSON-RPC (newline-delimited JSON).
// Usage: node scripts/devhub-create-audit-tasks.mjs
import { spawn } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const serverPath = resolve(repoRoot, 'devhub-mcp', 'server.js');
const dbPath = resolve(repoRoot, 'data', 'devhub.db');

const AUDIT_DOC = 'docs/audits/2026-07-24-agent-detection-notifications-audit.md';

const TASKS = [
  // ---- P0 ----
  {
    title: 'AGY-P0: Instalador de hooks nativos de Antigravity (PreInvocation/PreToolUse/Stop → agent-hook)',
    priority: 'critical',
    business_value: 10,
    description: `Antigravity (IDE, CLI y terminal) soporta hooks oficiales en ~/.gemini/config/hooks.json y .agents/hooks.json con eventos PreInvocation (=inicio), PreToolUse/PostToolUse (=trabajando) y Stop con fullyIdle+terminationReason (=fin). Extender src/lib/terminal/agentHooks/installer.js (hoy lanza 'Unsupported agent' en L247) con el caso agy: escribir hooks.json global apuntando a un bridge CLI → POST /api/terminal/agent-hook (endpoint ya existente). Fail-open si DevHub está caído. Quirk: el payload no incluye el nombre del evento (pasarlo como arg). Verificado por MemPalace INVESTIGATION.md y atamel.dev. Convierte inicio/fin de agy en eventos deterministas. Auditoría: ${AUDIT_DOC} §5.2, §6.1`,
  },
  {
    title: 'AGY-P0: Fix orden CR→stripAnsi en ingesta de detección de estado',
    priority: 'critical',
    business_value: 9,
    description: `El manejo de \\r del commit 3133f987 es código muerto: la ingesta hace stripAnsi() primero (sessionAgentDetector.js L93) y stripAnsi borra todos los \\r (stripAnsi.js L9), así que las líneas sobrescritas por CR (spinner/footer) se concatenan y las reglas lineRegex ancladas (^antigravity>$, [y/n]) fallan. Mover processCarriageReturns() antes de stripAnsi (o hacer stripAnsi CR-aware) en la ruta de ingesta y en el bundle del sidecar (agentDetection.cjs L1396). Agregar test que alimente bytes crudos con \\r por la ruta real. Auditoría: ${AUDIT_DOC} §2.3 W6`,
  },
  {
    title: "AGY-P0: Fallback 'sin match' → unknown (no idle) + quiescence por cualquier actividad",
    priority: 'critical',
    business_value: 9,
    description: `Dos cambios acoplados: (1) detector.js L121-124 convierte 'ninguna regla matcheó' en idle (IDLE_FALLBACK_DETECTION) — para agentes con manifest debe ser 'unknown'; (2) sessionAgentDetector.js L103-105 solo refresca lastWorkingAt en hits visibleWorking, y el tick L228-245 fuerza idle a los 2.5s → falsos 'terminó' cuando el footer sale del viewport durante streaming. Basar quiescence en CUALQUIER actividad de salida del PTY, no solo en reglas matched. Misma clase de bug documentada en vibe-kanban #2783. Auditoría: ${AUDIT_DOC} §2.3 W4`,
  },
  {
    title: 'AGY-P0: Detección de inicio por salida para antigravity (pre-attach/tmux/swarm)',
    priority: 'high',
    business_value: 8,
    description: `ttyServer.js L1208-1231 detecta TUI pre-adjuntado por salida para kimi/opencode/grok (detectKimiTuiReady L1208, detectOpenCodeTuiReady L1215, detectGrokSessionFromOutput L1225) pero no hay rama agy; sidecar server.js L354-374 igual. Crear detectAntigravityTuiReady (señales: '? for shortcuts', 'accept-edits ·', OSC title) + ready marker + wirear en ambos runtimes. Complementar con soporte agy en agentLaunchCommand.shared.js/agentLaunchWrapper.js (hoy cero menciones) para lanzamientos swarm. Auditoría: ${AUDIT_DOC} §2.3 W1, W8`,
  },
  {
    title: "NOTIF-P0: Notificar 'blocked' desde cualquier estado previo",
    priority: 'high',
    business_value: 8,
    description: `agentNotificationBridge.js L40 exige prev==='running' para notificar blocked. Con la detección flaky de agy, un permission prompt suele llegar desde idle/unknown ⇒ el usuario no es avisado justo cuando el agente lo necesita. Permitir transición →blocked desde idle/unknown (manteniendo anti-flicker MIN_RUNNING_DURATION donde aplique) + test de blocked-desde-idle. Auditoría: ${AUDIT_DOC} §3.2 N6`,
  },
  // ---- P1 ----
  {
    title: 'NOTIF-P1: Serializar agentType y wasCancelled en frames agent-state',
    priority: 'high',
    business_value: 8,
    description: `Los frames WS agent-state solo llevan {type, agentTuiState, at} (ttyServer.js L1270/2181/2523/2579; sidecar L380-383). El cliente lee payload.agentType (siempre undefined, useTerminalV2Session.js L687) y cae al initialCommand crudo; el mapa de etiquetas del bridge casi nunca aplica. wasCancelled se calcula server-side (sessionAgentDetector.js L117-136) pero nunca se serializa → la rama de notificación de cancelación (bridge L78-90) está muerta en producción. Agregar ambos campos + test de integración del schema del frame. Auditoría: ${AUDIT_DOC} §3.2 N4, N5`,
  },
  {
    title: 'NOTIF-P1: Deduplicar sonido y notificación de escritorio',
    priority: 'medium',
    business_value: 7,
    description: `Doble sonido: bridge reproduce (agentNotificationBridge.js L46/L93) y NotificationToastStack.jsx repite (L85-87) sobre el mismo evento. Doble desktop: dispatchOperationalNotification con delivery.desktop:true (Electron/Tauri) + web Notification del renderer cuando document.hidden (ToastStack L51-64). Dejar una sola vía para cada canal (fuente de verdad: preferencias + delivery del evento operacional). Auditoría: ${AUDIT_DOC} §3.2 N1, N2`,
  },
  {
    title: 'AGY-P1: Limpieza de estado al exit del agente (frame final + clear semantic state + reaper child-exit)',
    priority: 'high',
    business_value: 8,
    description: `handleSessionExit/finalizeSidecarSessionExit solo emiten {type:'exit'}: no hay frame final de estado ni evento operacional 'agente terminó/salió'. El cliente nunca llama clearPanelSemanticState (useTerminalV2Session.js L738-747) y los timers del bridge quedan colgados. Además, cuando agy lanzado tipeado muere pero bash sobrevive, session.agentType queda 'agy' para siempre (Enter posterior ⇒ running espurio; bash PS2 '>' matchea regla idle). Implementar: frame final + cleanup cliente + reaper/detección de child-exit que limpie agentType. Auditoría: ${AUDIT_DOC} §2.3 W7, §3.2 N7`,
  },
  {
    title: 'AGY-P1: Capas de redundancia de detección agy (transcript watch + liveness host IDE + reducer único)',
    priority: 'high',
    business_value: 8,
    description: `Patrón validado por Open Vibe Island y kimi-watch: (a) hooks nativos (tarea AGY-P0 instalador) como primario; (b) watch de ~/.gemini/antigravity-ide/brain/<conversationId>/**/transcript.jsonl (el transcriptPath viene en cada payload hook) con quiescence sobre pasos estructurados como secundario; (c) liveness del proceso host del IDE (Antigravity IDE.exe / language_server) como terciario — el subproceso agente puede ser TTY-less e invisible para ps (open-vibe-island issue #510). Un único session-state reducer debe reconciliar señales contradictorias. Auditoría: ${AUDIT_DOC} §5.3, §6.9`,
  },
  {
    title: 'DETECT-P1: Viewport/buffer conscientes de termsize (alt-screen redraws >8KB)',
    priority: 'medium',
    business_value: 6,
    description: `MAX_DETECTION_BUFFER_CHARS=8192 y viewport fijo de 40 líneas (extractBottomViewport.js L30-31): un redraw completo de alt-screen 120×36 con ANSI supera 8KB → el buffer guarda frames parciales y bottom_lines(N) mide desde una rebanada intermedia; en terminales altas el footer puede quedar fuera. Usar el termsize real de la sesión para dimensionar viewport/buffer y considerar líneas soft-wrapped. Auditoría: ${AUDIT_DOC} §2.3 W5`,
  },
  // ---- P2 ----
  {
    title: 'NOTIF-P2: dedupe_key estable (sin timestamp) para agregación occurrence_count',
    priority: 'low',
    business_value: 5,
    description: `agentNotificationBridge.js L58/86/105 incluye \${now} en dedupe_key → cada evento es único y mergeOperationalEvents (events.js L42-69) nunca agrega; el centro de notificaciones se llena de singletons y el cooldown es el único throttle. Usar key estable por panel+tipo+ventana. Auditoría: ${AUDIT_DOC} §3.2 N3`,
  },
  {
    title: 'AGY-P2: Regex de spinner robusto a locale + tracking de drift de manifests vs herdr',
    priority: 'low',
    business_value: 4,
    description: `manifests/antigravity.js L83 exige verbo ASCII terminado en '-ing'; TUIs localizados ('Leyendo', 'Analizando') no matchean. Basar la regla solo en braille/spinner o ampliar el patrón. Además el manifest está portado de herdr 2026.06.24.1 (herdr tiene ~20 manifests, DevHub 6): definir proceso para trackear upstream. Auditoría: ${AUDIT_DOC} §2.3 W9`,
  },
  {
    title: 'NOTIF-P2: Expiración de eventos no-leídos en el centro de notificaciones',
    priority: 'low',
    business_value: 4,
    description: `events.js L31-34 mantiene no-leídos para siempre: el spam acumulado hasta el cap de 200 desaloja eventos nuevos. Expirar no-leídos (p. ej. 7d como los leídos) o priorizar recencia en la evicción. Auditoría: ${AUDIT_DOC} §3.2 N8`,
  },
  {
    title: 'TEST-P2: Suite de regresión detección+notificaciones (paridad sidecar↔ttyServer, CR-ingest, blocked-desde-idle, exit)',
    priority: 'medium',
    business_value: 6,
    description: `Huecos: (1) test de integración del schema del frame agent-state (habría detectado N4/N5); (2) test que alimente bytes crudos con \\r por la ruta real de ingesta (W6); (3) blocked-desde-idle (N6); (4) cleanup en exit (N7/W7); (5) paridad sidecar↔ttyServer con el mismo fixture — prometido en openspec/changes/tui-status-herdr-parity/design.md L48 y nunca agregado; (6) inicio agy tipeado y pre-attach. Auditoría: ${AUDIT_DOC} §4`,
  },
  {
    title: 'OPENCODE-P2: Migrar detección opencode al bus SSE nativo (/event, session.idle, /session/status)',
    priority: 'medium',
    business_value: 6,
    description: `opencode serve expone GET /event (SSE, incluye session.idle emitido por el propio loop del agente) y GET /session/status (snapshot REST busy/idle). Consumir el bus en vez de PTY scraping + plugin: cero ambigüedad de parseo. Mantener scraping como fallback cuando no hay server. Docs: opencode.ai/docs/server. Auditoría: ${AUDIT_DOC} §5.1, §6 bonus`,
  },
];

function rpc(id, method, params) {
  return { jsonrpc: '2.0', id, method, params };
}

const messages = [
  rpc(1, 'initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'devhub-audit-tasks', version: '1.0.0' },
  }),
  { jsonrpc: '2.0', method: 'notifications/initialized', params: {} },
  rpc(2, 'tools/call', { name: 'list_projects', arguments: { status: 'all' } }),
];

const server = spawn(process.execPath, [serverPath], {
  cwd: repoRoot,
  env: { ...process.env, DEVHUB_DB_PATH: dbPath, DEVHUB_MCP_DB_DRIVER: 'sqlite' },
  stdio: ['pipe', 'pipe', 'inherit'],
});

let buffer = '';
const responses = new Map();
let expectedIds;

server.stdout.on('data', (chunk) => {
  buffer += chunk.toString('utf8');
  let idx;
  while ((idx = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line.startsWith('{')) continue;
    const msg = JSON.parse(line);
    if (msg.id != null) {
      responses.set(msg.id, msg);
      maybeAdvance();
    }
  }
});

function textOf(id) {
  return responses.get(id)?.result?.content?.[0]?.text ?? null;
}

let phase = 0;
function maybeAdvance() {
  if (phase === 0 && responses.has(2)) {
    phase = 1;
    const text = textOf(2);
    console.log('--- list_projects ---');
    console.log(text);
    let projects;
    try {
      projects = JSON.parse(text);
    } catch {
      console.error('No pude parsear list_projects');
      server.kill();
      process.exit(1);
    }
    const list = projects.projects || projects.items || projects;
    const arr = Array.isArray(list) ? list : [];
    if (arr.length === 0) {
      console.error('No hay proyectos en DevHub.');
      server.kill();
      process.exit(1);
    }
    // Prefer a project whose name mentions devhub/agenthub; otherwise the first.
    const preferred =
      arr.find((p) => /devhub|agenthub/i.test(p.name || '')) || arr[0];
    console.log(`\n>>> Proyecto seleccionado: ${preferred.name} (${preferred.id})`);
    server.stdin.write(
      JSON.stringify(
        rpc(3, 'tools/call', {
          name: 'list_tasks',
          arguments: { project_id: preferred.id, status: 'all' },
        })
      ) + '\n'
    );
    server.stdin.write(
      JSON.stringify(
        rpc(4, 'tools/call', {
          name: 'bulk_create_tasks',
          arguments: { project_id: preferred.id, tasks: TASKS },
        })
      ) + '\n'
    );
  } else if (phase === 1 && responses.has(3) && responses.has(4)) {
    phase = 2;
    console.log('\n--- list_tasks (antes) ---');
    console.log(textOf(3)?.slice(0, 2000));
    console.log('\n--- bulk_create_tasks ---');
    console.log(textOf(4));
    // verify
    const projText = textOf(2);
    const projects = JSON.parse(projText);
    const arr = projects.projects || projects.items || projects;
    const preferred =
      (Array.isArray(arr) ? arr : []).find((p) => /devhub|agenthub/i.test(p.name || '')) ||
      (Array.isArray(arr) ? arr[0] : null);
    server.stdin.write(
      JSON.stringify(
        rpc(5, 'tools/call', {
          name: 'list_tasks',
          arguments: { project_id: preferred.id, status: 'all' },
        })
      ) + '\n'
    );
  } else if (phase === 2 && responses.has(5)) {
    console.log('\n--- list_tasks (después, verificación) ---');
    const text = textOf(5);
    try {
      const parsed = JSON.parse(text);
      console.log(`total tareas: ${parsed.total}`);
      for (const t of parsed.tasks || []) {
        if (/^(AGY|NOTIF|DETECT|TEST|OPENCODE)-P/.test(t.title)) {
          console.log(`  [${t.priority}] ${t.status} — ${t.title}`);
        }
      }
    } catch {
      console.log(text);
    }
    server.kill();
    process.exit(0);
  }
}

for (const m of messages) server.stdin.write(JSON.stringify(m) + '\n');

setTimeout(() => {
  console.error('TIMEOUT esperando respuestas del servidor MCP');
  server.kill();
  process.exit(1);
}, 60_000);
