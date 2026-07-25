#!/usr/bin/env node
// One-shot: reconcilia el estado DevHub de las 15 tareas de la auditoría
// 2026-07-24 (implementadas en cd68ff3e) y registra las 6 tareas de la ronda
// DONE-EVIDENCE-01 (implementadas en fbe86580) ya completadas.
// Usage: node scripts/devhub-close-done-evidence-tasks.mjs
import { spawn } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const serverPath = resolve(repoRoot, 'devhub-mcp', 'server.js');
const dbPath = resolve(repoRoot, 'data', 'devhub.db');
const PROJECT_ID = 'fd1d5538-6d55-499e-8928-8ee93aa64cc7';

const ROUND1_PREFIX = /^(AGY|NOTIF|DETECT|TEST|OPENCODE)-P/;
const ROUND1_COMMENT =
  '[git:checkpoint] commit=cd68ff3e docs=docs/audits/2026-07-24-agent-detection-notifications-audit.md ' +
  'checks=342 tests verdes (19 suites) reportados por el agente implementor; spot-check de artefactos en árbol ' +
  '(antigravity-bridge.mjs, antigravityReadyMarker, antigravityTranscriptWatcher, ideHostLiveness, ' +
  'opencodeSseClient, bridgeConfig) verificado 2026-07-25. working-tree limpio para estos archivos.';

const ROUND2_TASKS = [
  {
    title: 'REASON-01: Taxonomía reason end-to-end (detector → frame → bridge) + reason-upgrade',
    priority: 'critical',
    business_value: 10,
    description:
      'Cada publicación de estado lleva reason (hook:<event>, prompt-visible, manifest, user-input, quiescence, ' +
      'quiescence-confirmed, pty-dead, agent-exit, exit). AgentStateMachine.publish la propaga; ' +
      'buildAgentStateFrame la toma de session.agentTuiStateReason; el cliente la reenvía al bridge. ' +
      'Reason-upgrade: idle autoritativo tras quiescence re-emite frame. Diseño: docs/designs/DONE-EVIDENCE-01-design.md',
  },
  {
    title: 'HOOK-02: KIMI_EVENTS v2 (PostToolUse*, SubagentStop, StopFailure, SessionEnd) + tool-active veto',
    priority: 'critical',
    business_value: 9,
    description:
      'installer.js: 14 eventos, marcador de bloque (v2), v1 detectado como outdated y re-mergado (no destructivo). ' +
      'handleHookReport mantiene session.hookToolActive; autoridad hook estirada a 30min con herramienta activa. ' +
      'Reinstalado en ~/.kimi-code/config.toml (backup preservado).',
  },
  {
    title: 'QUIET-03: Cuiescencia en dos etapas (4s badge-only, 12s notificable) + veto herramienta activa',
    priority: 'critical',
    business_value: 9,
    description:
      'Etapa 1 (DEVHUB_AGENT_QUIESCENCE_MS=4000): idle reason=quiescence — badge sin notificación. ' +
      'Etapa 2 (DEVHUB_AGENT_QUIESCENCE_CONFIRM_MS=12000): upgrade a quiescence-confirmed — fallback notificable ' +
      'para agentes sin hooks. Vetada mientras hookToolActive (tope 30min). Bundle sidecar regenerado.',
  },
  {
    title: 'BRIDGE-04: Gate de notificación done por evidencia + nombres canónicos de agente',
    priority: 'high',
    business_value: 9,
    description:
      "agentNotificationBridge: 'done' solo con evidencia positiva (DONE_EVIDENCE_REASONS); quiescence nunca notifica; " +
      "hook:Interrupt → notificación de cancelada; reasonChanged procesa upgrades idle→idle. " +
      'Nuevo src/lib/agents/agentDisplayNames.js (kimi→Kimi Code, agy→Antigravity…); se elimina el fallback a ' +
      'initialCommand como identidad. Corrige el reporte de nombre erróneo ("Kimiko D").',
  },
  {
    title: 'TRACE-05: Trace JSONL de transiciones de estado de agentes',
    priority: 'medium',
    business_value: 7,
    description:
      'src/lib/terminal/agentStateTrace.js: append por transición a data/logs/agent-state/<fecha>.jsonl ' +
      '(terminalId, agentType, prev, next, reason, hookEvent, edades de hook/actividad, source, upgrade). ' +
      'Rotación 5MB, kill-switch DEVHUB_AGENT_TRACE=off. Convierte flakes intermitentes en evidencia.',
  },
  {
    title: 'TEST-06: Regresión DONE-EVIDENCE (gate, dos etapas, veto, upgrade, installer v2, nombres)',
    priority: 'high',
    business_value: 8,
    description:
      '200 tests verdes en 10 suites: sessionAgentDetector (etapas, veto, cap, prompt-visible, pty-dead), ' +
      'agentHooks (toolActive, reason-upgrade, no re-emit), agentHookInstaller (v2, legacy v1), agentStateFrame ' +
      '(reason default), agentNotificationBridge (gate por reason, cancelada, upgrade 1 sola notificación), ' +
      'agentDisplayNames, detector (reason:null), paridad sidecar↔ttyServer. eslint 0 errores en archivos tocados.',
  },
];
const ROUND2_COMMENT =
  '[git:checkpoint] commit=fbe86580 docs=docs/designs/DONE-EVIDENCE-01-design.md ' +
  'checks=200 tests verdes (10 suites scoped) + eslint 0 errores en archivos tocados + bundle sidecar regenerado y ' +
  'paridad verificada. Nota: el árbol contiene WIP ajeno (lint-cleanup) NO incluido en el commit.';

function rpc(id, method, params) {
  return { jsonrpc: '2.0', id, method, params };
}

const server = spawn(process.execPath, [serverPath], {
  cwd: repoRoot,
  env: { ...process.env, DEVHUB_DB_PATH: dbPath, DEVHUB_MCP_DB_DRIVER: 'sqlite' },
  stdio: ['pipe', 'pipe', 'inherit'],
});

let buffer = '';
const responses = new Map();
let nextId = 1;
const pending = [];
function send(method, params) {
  const id = nextId++;
  pending.push(id);
  server.stdin.write(JSON.stringify(rpc(id, method, params)) + '\n');
  return id;
}
const tool = (name, args) => send('tools/call', { name, arguments: args });

server.stdout.on('data', (chunk) => {
  buffer += chunk.toString('utf8');
  let idx;
  while ((idx = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line.startsWith('{')) continue;
    const msg = JSON.parse(line);
    if (msg.id != null) responses.set(msg.id, msg);
  }
});

function textOf(id) {
  return responses.get(id)?.result?.content?.[0]?.text ?? null;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(id, label) {
  for (let i = 0; i < 300; i += 1) {
    if (responses.has(id)) return responses.get(id);
    await sleep(100);
  }
  throw new Error(`timeout esperando ${label} (id=${id})`);
}

async function main() {
  send('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'devhub-close-done-evidence', version: '1.0.0' },
  });
  server.stdin.write(
    JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }) + '\n'
  );

  const listId = tool('list_tasks', { project_id: PROJECT_ID, status: 'all' });
  const listRes = await waitFor(listId, 'list_tasks');
  const parsed = JSON.parse(textOf(listId) || '{}');
  const round1 = (parsed.tasks || []).filter((t) => ROUND1_PREFIX.test(t.title));
  console.log(`Tareas ronda 1 encontradas: ${round1.length} (estados: ${[...new Set(round1.map((t) => t.status))].join(',')})`);

  // 1) Completar ronda 1 (secuencial para no saturar stdio).
  for (const t of round1) {
    if (t.status === 'completed') {
      console.log(`  ya completed: ${t.title.slice(0, 60)}`);
      continue;
    }
    const u = tool('update_task', { task_id: t.id, status: 'completed' });
    await waitFor(u, 'update_task');
    const c = tool('add_task_comment', { task_id: t.id, content: ROUND1_COMMENT });
    await waitFor(c, 'add_task_comment');
    console.log(`  completed: ${t.title.slice(0, 70)}`);
  }

  // 2) Crear y cerrar ronda 2.
  const existing = (parsed.tasks || []).filter((t) => /^(REASON|HOOK|QUIET|BRIDGE|TRACE|TEST)-0/.test(t.title));
  let created = [];
  if (existing.length > 0) {
    console.log(`Ronda 2 ya existía (${existing.length}) — se actualizan a completed.`);
    created = existing;
  } else {
    const b = tool('bulk_create_tasks', { project_id: PROJECT_ID, tasks: ROUND2_TASKS });
    const bres = await waitFor(b, 'bulk_create_tasks');
    const btext = textOf(b) || '';
    try {
      const bp = JSON.parse(btext);
      created = bp.tasks || bp.created || [];
    } catch {
      created = [];
    }
    console.log(`bulk_create_tasks ronda 2: ${created.length} creadas`);
    if (created.length === 0) {
      const relist = tool('list_tasks', { project_id: PROJECT_ID, status: 'all' });
      await waitFor(relist, 'relist');
      const rp = JSON.parse(textOf(relist) || '{}');
      created = (rp.tasks || []).filter((t) => /^(REASON|HOOK|QUIET|BRIDGE|TRACE|TEST)-0/.test(t.title));
      console.log(`  relist encontró ${created.length}`);
    }
  }
  for (const t of created) {
    if (t.status === 'completed') continue;
    const u = tool('update_task', { task_id: t.id, status: 'completed' });
    await waitFor(u, 'update_task r2');
    const c = tool('add_task_comment', { task_id: t.id, content: ROUND2_COMMENT });
    await waitFor(c, 'comment r2');
    console.log(`  completed: ${t.title.slice(0, 70)}`);
  }

  server.kill();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  server.kill();
  process.exit(1);
});

setTimeout(() => {
  console.error('TIMEOUT global');
  server.kill();
  process.exit(1);
}, 120000);
