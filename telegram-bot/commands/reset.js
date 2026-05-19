const { quarantineLegacyCommand } = require('../services/command-quarantine');

/**
 * /reset — Reset current conversation history.
 */
module.exports = async function reset(bot, msg) {
  return quarantineLegacyCommand(bot, msg, 'reset');
};
