/**
 * Slower polling in Next dev to avoid hammering heavy routes (operations/health)
 * and exhausting the Turbopack dev server heap.
 */
function isNextDevelopment() {
  return process.env.NODE_ENV === 'development';
}

function swarmHealthPollIntervalMs() {
  return isNextDevelopment() ? 20_000 : 5_000;
}

function swarmProvisionPollIntervalMs() {
  return isNextDevelopment() ? 20_000 : 3_000;
}

module.exports = {
  isNextDevelopment,
  swarmHealthPollIntervalMs,
  swarmProvisionPollIntervalMs,
};
