const path = require('path');
const opencode = require('../telegram-bot/services/opencode');
const activityLogger = require('../telegram-bot/services/activityLogger'); // Assuming this exists based on phase 5

async function main() {
  console.log('🚀 Iniciando prueba funcional de OpenCode Headless...');

  try {
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
    // Intentar limpiar todo al final
    console.log('🧹 Limpiando servidor y cerrando prueba...');
    if (opencode.shutdownServer) {
      await opencode.shutdownServer();
    }
    process.exit(0);
  }
}

main();
