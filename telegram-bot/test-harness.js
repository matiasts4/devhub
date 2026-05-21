const Database = require('better-sqlite3');
const conversation = require('./services/conversation');
const { resolveDbPath } = require('../src/lib/db/pathResolver');

// Conexión mockeada a la base de datos
const DB_PATH = resolveDbPath({ moduleDir: __dirname, forceCanonicalInTests: true });
const db = new Database(DB_PATH, { fileMustExist: true });

// Mock del bot de Telegram
const botMock = {
  sendMessage: async (chatId, text) => {
    console.log(`\n[Bot -> ${chatId}] ${text}`);
  },
};

async function run(chatId, text) {
  const msg = {
    chat: { id: chatId },
    from: { first_name: 'TestUser' },
    text,
  };

  console.log(`\n[User ${chatId}] ${text}`);
  await conversation.handleChat(botMock, msg, db);
}

(async () => {
  try {
    const [, , chatIdArg, ...textParts] = process.argv;
    const chatId = chatIdArg || '123456';
    const text = textParts.join(' ') || 'Hola';
    await run(chatId, text);
  } catch (err) {
    console.error('Test harness failed:', err);
    process.exit(1);
  } finally {
    db.close();
  }
})();
