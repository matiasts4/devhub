#!/usr/bin/env node
/**
 * Dev helper: evaluate agent-state detection on a fixture file.
 * Usage: node scripts/explain-agent-detection.mjs --agent grok --file tests/fixtures/agent-screens/grok-idle-footer.txt
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  let agent = null;
  let file = null;
  let oscTitle = '';
  let oscProgress = '';
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--agent') agent = argv[++i];
    else if (argv[i] === '--file') file = argv[++i];
    else if (argv[i] === '--osc-title') oscTitle = argv[++i] || '';
    else if (argv[i] === '--osc-progress') oscProgress = argv[++i] || '';
  }
  return { agent, file, oscTitle, oscProgress };
}

const { agent, file, oscTitle, oscProgress } = parseArgs(process.argv);
if (!agent || !file) {
  console.error(
    'Usage: node scripts/explain-agent-detection.mjs --agent <type> --file <path> [--osc-title t] [--osc-progress p]'
  );
  process.exit(2);
}

const screen = fs.readFileSync(path.resolve(root, file), 'utf8');
const mod = await import(
  pathToFileURL(path.join(root, 'src/lib/terminal/agentStateDetection/detector.js')).href
);
const result = mod.detectAgentState(agent, screen, { oscTitle, oscProgress });
console.log(JSON.stringify({ agent, file, result }, null, 2));