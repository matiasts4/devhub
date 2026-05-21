const path = require('path');
const opencode = require('../telegram-bot/services/opencode');
const activityLogger = require('../telegram-bot/services/activityLogger'); // Assuming this exists based on phase 5
const { TestHarness } = require('./agenthub/harness');

async function main() {
  console.log('🚀 Iniciando prueba funcional de OpenCode Headless...');

  // Create harness for flow lock management
  const harness = new TestHarness({
    dbPath: ':memory:',
    lockOwner: 'headless-test',
  });
  harness.setupDb();

  try {
    // Acquire flow lock for the entire headless test
    console.log('🔒 Adquiriendo flow lock...');
    const lockIds = await harness.acquireLocks([{ type: 'flow', key: 'headless-functional' }]);
    console.log(`🔒 Flow lock adquirido: ${lockIds.join(', ')}`);

    const prompt = 'Explicame brevemente qué es el patrón Singleton en 2 líneas.';
    const agent = 'sdd-orchestrator'; // O el que tengas por defecto
    console.log(`📝 Enviando prompt: "${prompt}" al agente: ${agent}`);

    // Ejecutar con callbacks de evento para emular la UI
    const result = await opencode.run(agent, prompt, {
      cwd: process.cwd(),
      onEvent: (msg) => {
        console.log(`[UI Event] ⏳ ${msg}`);
      },
    });

    console.log('\n✅ === TAREA COMPLETADA ===');
    console.log(result);
    console.log('==========================\n');
  } catch (error) {
    console.error('❌ Falló la ejecución de OpenCode:', error);
  } finally {
    // Release flow lock
    console.log('🔓 Liberando flow lock...');
    if (harness._activeLocks.length > 0) {
      await harness.releaseLocks(harness._activeLocks);
    }

    // Intentar limpiar todo al final
    console.log('🧹 Limpiando servidor y cerrando prueba...');
    if (opencode.shutdownServer) {
      await opencode.shutdownServer();
    }
    harness.teardownDb();
    process.exit(0);
  }
}

main();
