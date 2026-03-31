const api = require('../services/api');
const formatter = require('../services/formatter');
const logger = require('../utils/logger');

/**
 * /spawn [tarea] [perfil] — Launch agent with custom task directly.
 *
 * Parse args: first word is profile (optional, default 'default'), rest is task description.
 * Example: /spawn "Implementar auth JWT" default
 * Example: /spawn Fix the login bug
 *
 * Steps:
 * 1. Check Next.js health with api.health()
 * 2. Get profiles with api.getProfiles() to validate (optional, just warn if profile not found)
 * 3. Call api.launchAgent({ task: taskDescription, profileName: profile, projectId: null })
 * 4. Respond with formatter.formatLaunch(taskDescription, 'direct', profile)
 */
module.exports = async function spawn(bot, msg, args) {
  try {
    const chatId = msg.chat.id;

    if (!args || !args.trim()) {
      return bot.sendMessage(
        chatId,
        formatter.formatError('Uso: /spawn <tarea> [perfil]. Ejemplo: /spawn Implementar auth JWT'),
        { parse_mode: 'Markdown' }
      );
    }

    // Parse args: try to detect profile at the end
    const knownProfiles = ['default', 'claude-sonnet', 'claude-opus', 'gemini-pro', 'gpt-4o'];
    const parts = args.trim().split(/\s+/);
    let profile = 'default';
    let taskDescription = args.trim();

    // Check if last word is a known profile
    const lastWord = parts[parts.length - 1].toLowerCase();
    if (knownProfiles.includes(lastWord)) {
      profile = lastWord;
      taskDescription = parts.slice(0, -1).join(' ');
    }

    if (!taskDescription) {
      return bot.sendMessage(
        chatId,
        formatter.formatError('Debes proporcionar una descripción de tarea'),
        { parse_mode: 'Markdown' }
      );
    }

    // 1. Check Next.js health
    try {
      await api.health();
    } catch {
      return bot.sendMessage(chatId, formatter.formatError('Next.js no está corriendo'), {
        parse_mode: 'Markdown',
      });
    }

    // 2. Validate profile (optional — just warn if not found)
    try {
      const profiles = await api.getProfiles();
      const profileNames = profiles
        .map((p) => p.name || p)
        .map(String)
        .map((n) => n.toLowerCase());
      if (!profileNames.includes(profile.toLowerCase())) {
        logger.warn(`Perfil "${profile}" no encontrado en la lista de perfiles disponibles`);
        // Don't block, just warn — the API might still accept it
      }
    } catch {
      // If we can't fetch profiles, just proceed with the specified profile
      logger.warn('No se pudieron obtener los perfiles disponibles, continuando');
    }

    // 3. Launch agent
    await api.launchAgent({
      task: taskDescription,
      profileName: profile,
      projectId: null,
    });

    logger.info(`Spawn directo: "${taskDescription}" con perfil "${profile}"`);

    // 4. Respond
    return bot.sendMessage(chatId, formatter.formatLaunch(taskDescription, 'direct', profile), {
      parse_mode: 'Markdown',
    });
  } catch (err) {
    logger.error(`Error en /spawn: ${err.message}`);
    return bot.sendMessage(msg.chat.id, formatter.formatError(err.message), {
      parse_mode: 'Markdown',
    });
  }
};
