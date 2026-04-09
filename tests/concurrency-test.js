const opencode = require('../telegram-bot/services/opencode');
const { TestHarness } = require('./agenthub/harness');

async function main() {
  console.log('🚀 Iniciando prueba de estrés: 5 sesiones concurrentes...');

  // Create a shared harness for lock management
  const harness = new TestHarness({
    dbPath: ':memory:',
    lockOwner: 'concurrency-test',
  });
  harness.setupDb();

  const concurrency = 5;
  const promises = [];

  for (let i = 1; i <= concurrency; i++) {
    const prompt = `Cuentame un chiste corto de programadores. Eres el agente número ${i}.`;
    const agent = 'sdd-orchestrator';
    const workerId = `worker-${i}`;

    console.log(`[${workerId}] Adquiriendo locks...`);

    // Acquire endpoint and session locks for this worker
    const lockIds = await harness.acquireLocks([
      { type: 'endpoint', key: 'headless' },
      { type: 'session', key: workerId },
    ]);

    console.log(`[${workerId}] Locks adquiridos: ${lockIds.join(', ')}`);
    console.log(`[${workerId}] Iniciando sesión...`);

    const p = opencode
      .run(agent, prompt, {
        cwd: process.cwd(),
        onEvent: (msg) => {
          // console.log(`[${workerId} UI Event] ⏳ ${msg}`); // Uncomment to see all events
        },
      })
      .then(async (result) => {
        console.log(
          `\n✅ [${workerId}] === COMPLETADO ===\n${result}\n==========================\n`
        );
      })
      .catch(async (err) => {
        console.error(`❌ [${workerId}] Falló:`, err);
      })
      .finally(async () => {
        // Release locks after completion
        console.log(`[${workerId}] Liberando locks...`);
        await harness.releaseLocks(lockIds);
      });

    promises.push(p);
  }

  await Promise.all(promises);

  console.log('🧹 Limpiando servidor y cerrando prueba concurrente...');
  if (opencode.shutdownServer) {
    await opencode.shutdownServer();
  }
  harness.teardownDb();
  process.exit(0);
}

main();
