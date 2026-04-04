/**
 * Session Bridge — Maps Telegram chat IDs to AgentHub sessions.
 *
 * This is the core service that bridges Telegram chat IDs to persistent
 * AgentHub sessions stored in SQLite. It ensures session continuity across
 * messages and provides session management (create, switch, list).
 *
 * Usage:
 *   const sessionBridge = require('./services/session-bridge');
 *   const session = await sessionBridge.resolveSession(chatId, projectId, directory);
 */

const db = require('../lib/db-bridge');
const logger = require('../utils/logger');
const opencode = require('./opencode');

const DEFAULT_PROJECT_ID = process.env.DEFAULT_PROJECT_ID || null;
const DEFAULT_DIRECTORY = process.env.DEFAULT_DIRECTORY || process.cwd();

/**
 * Resolve the active session for a Telegram chat.
 * Returns existing active session or creates a new one.
 *
 * @param {string|number} chatId - Telegram chat ID
 * @param {string|null} [projectId] - Project ID (uses default if not provided)
 * @param {string|null} [directory] - Working directory for OpenCode
 * @returns {Promise<object>} Session info with { session, isNew, opencodeSessionId }
 */
async function resolveSession(chatId, projectId, directory) {
  const chatIdStr = String(chatId);
  const projId = projectId || DEFAULT_PROJECT_ID;
  const dir = directory || DEFAULT_DIRECTORY;

  // 1. Check if there's an active session mapping
  const existing = db.getTelegramSession(chatIdStr);

  if (existing) {
    // 2. Verify the session still exists and is active
    const session = db.getSession(existing.session_id);
    if (session && session.status !== 'completed') {
      logger.debug(`Reusing active session ${session.id} for chat ${chatIdStr}`);
      return {
        session,
        isNew: false,
        opencodeSessionId: session.opencode_session_id,
      };
    }

    // Session is completed — deactivate the mapping
    db.updateSessionStatus(existing.session_id, 'completed');
  }

  // 3. Create a new session
  logger.info(`Creating new session for chat ${chatIdStr}, project ${projId || 'none'}`);
  const newSession = await createSession(chatIdStr, projId, dir);

  return {
    session: newSession,
    isNew: true,
    opencodeSessionId: newSession.opencode_session_id,
  };
}

/**
 * Create a new AgentHub session and map it to a Telegram chat.
 *
 * @param {string} chatId - Telegram chat ID
 * @param {string|null} [projectId] - Project ID
 * @param {string|null} [directory] - Working directory
 * @param {string|null} [title] - Session title
 * @returns {Promise<object>} The created session with opencode_session_id
 */
async function createSession(chatId, projectId, directory, title) {
  const chatIdStr = String(chatId);
  const dir = directory || DEFAULT_DIRECTORY;

  // 1. Create AgentHub session in SQLite
  const session = db.createSession({
    project_id: projectId || null,
    title: title || `Telegram ${new Date().toLocaleString()}`,
    telegram_chat_id: chatIdStr,
    directory: dir,
  });

  // 2. Create OpenCode session
  await opencode.ensureServer(dir);
  const ocSession = await opencode.createSession(dir);

  // 3. Link OpenCode session ID
  db.updateSessionOpenCodeId(session.id, ocSession.id);

  // 4. Create telegram_session_map
  db.createTelegramSession(chatIdStr, session.id, projectId);

  logger.info(`Session created: ${session.id} (OpenCode: ${ocSession.id}) for chat ${chatIdStr}`);

  return {
    ...session,
    opencode_session_id: ocSession.id,
  };
}

/**
 * Get session history for a Telegram chat.
 *
 * @param {string|number} chatId
 * @param {number} [limit=20]
 * @returns {Array} Array of session objects
 */
function getSessions(chatId, limit = 20) {
  return db.getSessionsByChat(String(chatId), limit);
}

/**
 * Switch to a different session for a Telegram chat.
 *
 * @param {string|number} chatId
 * @param {string} sessionId - The session ID to switch to
 * @returns {object|null} The activated session or null if not found
 */
function switchSession(chatId, sessionId) {
  const chatIdStr = String(chatId);
  const session = db.getSession(sessionId);

  if (!session) {
    logger.warn(`Session ${sessionId} not found for switch`);
    return null;
  }

  // Deactivate current mapping and activate the new one
  db.createTelegramSession(chatIdStr, sessionId, session.project_id);

  logger.info(`Switched chat ${chatIdStr} to session ${sessionId}`);
  return session;
}

/**
 * Get the current active session info for a chat.
 *
 * @param {string|number} chatId
 * @returns {object|null} Session info or null
 */
function getActiveSession(chatId) {
  const mapping = db.getTelegramSession(String(chatId));
  if (!mapping) return null;

  const session = db.getSession(mapping.session_id);
  if (!session) return null;

  const usage = db.getUsage(session.id);

  return {
    ...session,
    usage,
    telegram_chat_id: mapping.telegram_chat_id,
  };
}

/**
 * Switch the active project for a Telegram chat.
 * This updates the session's project_id and directory.
 *
 * @param {string|number} chatId
 * @param {string} projectNameOrId - Project name or ID
 * @returns {object|null} Updated session or null if project not found
 */
function switchProject(chatId, projectNameOrId) {
  const project = db.findProject(projectNameOrId);
  if (!project) {
    logger.warn(`Project "${projectNameOrId}" not found`);
    return null;
  }

  const chatIdStr = String(chatId);
  const mapping = db.getTelegramSession(chatIdStr);

  if (!mapping) {
    logger.warn(`No active session for chat ${chatIdStr}`);
    return null;
  }

  const session = db.getSession(mapping.session_id);
  if (!session) return null;

  // Update session with new project and directory
  db.db
    .prepare(
      `
    UPDATE agent_hub_sessions
    SET project_id = ?, directory = ?, updated_at = datetime('now')
    WHERE id = ?
  `
    )
    .run(project.id, project.directory || DEFAULT_DIRECTORY, session.id);

  // Update telegram_session_map project_id
  db.db
    .prepare(
      `
    UPDATE telegram_session_map SET project_id = ?, updated_at = datetime('now')
    WHERE telegram_chat_id = ? AND session_id = ?
  `
    )
    .run(project.id, chatIdStr, session.id);

  logger.info(`Switched chat ${chatIdStr} to project ${project.name} (${project.id})`);

  return {
    ...db.getSession(session.id),
    project,
  };
}

module.exports = {
  resolveSession,
  createSession,
  getSessions,
  switchSession,
  getActiveSession,
  switchProject,
};
