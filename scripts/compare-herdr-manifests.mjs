#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const agents = ['kimi', 'claude', 'codex', 'opencode', 'grok', 'antigravity'];

function herdrMeta(agent) {
  const p = path.join(root, '.research/herdr/src/detect/manifests', `${agent}.toml`);
  const t = fs.readFileSync(p, 'utf8');
  const ids = [...t.matchAll(/^id = "([^"]+)"/gm)].map((m) => m[1]);
  const ver = t.match(/^version = "([^"]+)"/m)?.[1] ?? '?';
  return { ver, rules: ids.slice(1) };
}

function devhubMeta(agent) {
  const p = path.join(root, 'src/lib/terminal/agentStateDetection/manifests', `${agent}.js`);
  const t = fs.readFileSync(p, 'utf8');
  const ids = [...t.matchAll(/id: '([^']+)'/g)].map((m) => m[1]);
  const ver = t.match(/version: '([^']+)'/)?.[1] ?? '?';
  return { ver, rules: ids.slice(1) };
}

for (const agent of agents) {
  const h = herdrMeta(agent);
  const d = devhubMeta(agent);
  const onlyH = h.rules.filter((id) => !d.rules.includes(id));
  const onlyD = d.rules.filter((id) => !h.rules.includes(id));
  console.log(`\n=== ${agent} (herdr ${h.ver} vs devhub ${d.ver}) ===`);
  console.log(`herdr: ${h.rules.length} rules | devhub: ${d.rules.length} rules`);
  if (onlyH.length) console.log('missing in devhub:', onlyH.join(', '));
  if (onlyD.length) console.log('extra in devhub:', onlyD.join(', '));
}