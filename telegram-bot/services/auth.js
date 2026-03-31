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

module.exports = { isAllowed };
