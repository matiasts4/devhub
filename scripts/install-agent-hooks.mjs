#!/usr/bin/env node
import { installAgentHook, uninstallAgentHook, getAgentHookStatus } from '../src/lib/terminal/agentHooks/installer.js';

function parseArgs() {
  const args = process.argv.slice(2);
  let agent = null;
  let uninstall = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--agent' && args[i + 1]) {
      agent = args[i + 1];
      i++;
    } else if (args[i] === '--uninstall') {
      uninstall = true;
    } else if (args[i].startsWith('--agent=')) {
      agent = args[i].split('=')[1];
    }
  }

  return { agent, uninstall };
}

function main() {
  const { agent, uninstall } = parseArgs();

  if (!agent || !['kimi', 'claude', 'opencode'].includes(agent)) {
    console.error('Usage: node scripts/install-agent-hooks.mjs --agent kimi|claude|opencode [--uninstall]');
    process.exit(1);
  }

  try {
    if (uninstall) {
      console.log(`Desinstalando hooks para ${agent}...`);
      const res = uninstallAgentHook(agent);
      console.log(`[OK] Hooks de ${agent} desinstalados.`);
      console.log(`     Config original preservada en: ${res.configPath}`);
    } else {
      console.log(`Instalando hooks para ${agent}...`);
      const res = installAgentHook(agent);
      console.log(`[OK] Hooks de ${agent} instalados exitosamente.`);
      console.log(`     Archivo modificado: ${res.configPath}`);
      if (res.scriptPath) {
        console.log(`     Script ejecutable: ${res.scriptPath}`);
      }
      console.log(`     Eventos cubiertos: SessionStart, UserPromptSubmit, PreToolUse, Stop, PermissionRequest...`);
    }
  } catch (err) {
    console.error(`[ERROR] ${err.message}`);
    process.exit(1);
  }
}

main();
