/**
 * Auth service — controls which Telegram chat IDs are allowed to use the bot.
 *
 * Reads ALLOWED_USER_IDS from environment (comma-separated numbers).
 * If not configured, allows everyone with a dev-mode warning.
 */

const allowedIds = process.env.ALLOWED_USER_IDS
  ? process.env.ALLOWED_USER_IDS.split(',')
      .map((id) => id.trim())
      .filter(Boolean)
  : [];

let warned = false;

function resolveAllowedActor(db, telegramUserId, telegramChatId = null) {
  if (!db || typeof db.prepare !== 'function') {
    throw new Error('Database handle requerido para resolver actor allowlisted.');
  }

  const row = db
    .prepare('SELECT * FROM telegram_actor_mappings WHERE telegram_user_id = ? LIMIT 1')
    .get(String(telegramUserId));
  if (!row || !Number(row.allowlisted || 0)) {
    return null;
  }

  if (telegramChatId && row.telegram_chat_id && String(row.telegram_chat_id) !== String(telegramChatId)) {
    return null;
  }

  return {
    actor_id: row.actor_id,
    devhub_actor_id: row.devhub_actor_id,
    telegram_user_id: row.telegram_user_id,
    telegram_chat_id: row.telegram_chat_id,
    display_name: row.display_name,
    allowlisted: true,
  };
}

/**
 * Check if a chat ID is allowed to interact with the bot.
 * @param {number|string} chatId - Telegram chat/user ID
 * @returns {boolean}
 */
function isAllowed(chatId) {
  // No allowed IDs configured → dev mode, allow all
  if (allowedIds.length === 0) {
    if (!warned) {
      console.warn('[WARN] ALLOWED_USER_IDS not configured — bot is open to everyone (dev mode)');
      warned = true;
    }
    return true;
  }

  return allowedIds.includes(String(chatId));
}

module.exports = { isAllowed, resolveAllowedActor };
