const { quarantineLegacyCommand } = require('../services/command-quarantine');

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
  return quarantineLegacyCommand(bot, msg, 'spawn');
};
