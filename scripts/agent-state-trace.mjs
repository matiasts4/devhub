#!/usr/bin/env node
// agent-state-trace — inspección del trace JSONL de estados de agentes
// (escrito por src/lib/terminal/agentStateTrace.js en data/logs/agent-state/).
//
// Uso:
//   node scripts/agent-state-trace.mjs                     # últimas 40 transiciones de hoy
//   node scripts/agent-state-trace.mjs --stats             # resumen por terminal (salud de hooks)
//   node scripts/agent-state-trace.mjs --terminal term-1   # filtra por terminalId
//   node scripts/agent-state-trace.mjs --agent kimi        # filtra por agentType
//   node scripts/agent-state-trace.mjs --file data/logs/agent-state/2026-07-25.jsonl
//   node scripts/agent-state-trace.mjs --follow            # tail en vivo (poll 1s)
//
// Lectura rápida de salud:
//   - reason 'hook:*' presentes  → los hooks del agente están llegando (señal primaria).
//   - solo 'manifest'/'quiescence*' → la sesión vive de screen-scraping (hooks ausentes:
//     sesión re-adjuntada, env no inyectada, o agente sin hooks instalados).
//   - 'quiescence' seguido de 'running' repetidamente → falsos idles por silencio;
//     si además NO hay 'hook:*', la sesión no tiene canal autoritativo.
import { readFileSync, existsSync, statSync, watchFile, unwatchFile } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
function opt(name, fallback = null) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
}
const has = (name) => args.includes(`--${name}`);

const today = new Date().toISOString().slice(0, 10); // el writer usa fecha UTC
const file = opt('file', join('data', 'logs', 'agent-state', `${today}.jsonl`));
const terminalFilter = opt('terminal');
const agentFilter = opt('agent');
const lastN = Number(opt('last', 40));

function readEntries() {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function fmt(e) {
  const t = new Date(e.at).toISOString().slice(11, 19);
  const prev = e.prev ?? '∅';
  const hook = e.hookEvent ? ` hook=${e.hookEvent}` : '';
  const ages =
    e.lastActivityAgeMs != null ? ` silent=${(e.lastActivityAgeMs / 1000).toFixed(1)}s` : '';
  const up = e.upgrade ? ' [upgrade]' : '';
  return `${t} ${String(e.terminalId).padEnd(14)} ${String(e.agentType ?? '?').padEnd(11)} ${prev} → ${e.next}  (${e.reason ?? '-'})${hook}${ages}${up} src=${e.source ?? '-'}`;
}

function matches(e) {
  if (terminalFilter && e.terminalId !== terminalFilter) return false;
  if (agentFilter && e.agentType !== agentFilter) return false;
  return true;
}

function printStats(entries) {
  const byTerminal = new Map();
  for (const e of entries) {
    if (!byTerminal.has(e.terminalId)) byTerminal.set(e.terminalId, []);
    byTerminal.get(e.terminalId).push(e);
  }
  for (const [id, list] of byTerminal) {
    const reasons = {};
    const hookEvents = new Set();
    for (const e of list) {
      reasons[e.reason ?? '-'] = (reasons[e.reason ?? '-'] ?? 0) + 1;
      if (e.hookEvent) hookEvents.add(e.hookEvent);
    }
    const last = list[list.length - 1];
    const usesHooks = list.some((e) => (e.reason ?? '').startsWith('hook:'));
    const verdict = usesHooks
      ? 'HOOKS OK (canal autoritativo activo)'
      : 'SCRAPING ONLY — hooks NO están llegando a esta sesión';
    console.log(`\n${id}  [${last.agentType ?? '?'}]  ${verdict}`);
    console.log(
      `  último: ${last.next} (${last.reason ?? '-'})  ${new Date(last.at).toISOString().slice(11, 19)}`
    );
    console.log(
      `  reasons: ${Object.entries(reasons)
        .map(([k, v]) => `${k}×${v}`)
        .join('  ')}`
    );
    if (hookEvents.size) console.log(`  hook events: ${[...hookEvents].join(', ')}`);
  }
  if (byTerminal.size === 0) console.log('(sin entradas que coincidan)');
}

if (has('stats')) {
  printStats(readEntries().filter(matches));
  process.exit(0);
}

if (has('follow')) {
  console.log(`siguiendo ${file} (Ctrl+C para salir)…`);
  let size = 0;
  const pump = () => {
    const entries = readEntries().filter(matches);
    if (entries.length > size) {
      for (const e of entries.slice(size)) console.log(fmt(e));
      size = entries.length;
    }
  };
  if (existsSync(file)) pump();
  size = readEntries().length;
  watchFile(file, { interval: 1000 }, () => pump());
  process.stdin.resume();
} else {
  const entries = readEntries().filter(matches);
  if (entries.length === 0) {
    console.log(`sin entradas en ${file}`);
    if (!existsSync(file)) {
      console.log('(el archivo no existe — ¿la app se reinició tras DONE-EVIDENCE-01?)');
    }
    process.exit(0);
  }
  for (const e of entries.slice(-lastN)) console.log(fmt(e));
}
