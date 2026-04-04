const opencode = require('../telegram-bot/services/opencode');

async function main() {
  console.log('🚀 Iniciando prueba de estrés: 5 sesiones concurrentes...');

  const concurrency = 5;
  const promises = [];

  for (let i = 1; i <= concurrency; i++) {
    const prompt = `Cuentame un chiste corto de programadores. Eres el agente número ${i}.`;
    const agent = 'sdd-orchestrator';

    console.log(`[Agente ${i}] Iniciando sesión...`);
    const p = opencode.run(agent, prompt, {
      cwd: process.cwd(),
      onEvent: (msg) => {
        // console.log(`[Agente ${i} UI Event] ⏳ ${msg}`); // Uncomment to see all events
      },
    }).then(result => {
      console.log(`\n✅ [Agente ${i}] === COMPLETADO ===\n${result}\n==========================\n`);
    }).catch(err => {
      console.error(`❌ [Agente ${i}] Falló:`, err);
    });

    promises.push(p);
  }

  await Promise.all(promises);

  console.log('🧹 Limpiando servidor y cerrando prueba concurrente...');
  if (opencode.shutdownServer) {
    await opencode.shutdownServer();
  }
  process.exit(0);
}

main();
