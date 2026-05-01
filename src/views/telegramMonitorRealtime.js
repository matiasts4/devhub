const TELEGRAM_BUSY_POLLING_MS = 3_000;
const TELEGRAM_IDLE_POLLING_MS = 30_000;

function getTelegramPollingInterval(status) {
  return status?.is_busy ? TELEGRAM_BUSY_POLLING_MS : TELEGRAM_IDLE_POLLING_MS;
}

function shouldShowRealtimeBadge(status) {
  return Boolean(status?.is_busy);
}

function getCurrentToolDisplay(status) {
  return status?.current_tool || null;
}

module.exports = {
  TELEGRAM_BUSY_POLLING_MS,
  TELEGRAM_IDLE_POLLING_MS,
  getTelegramPollingInterval,
  shouldShowRealtimeBadge,
  getCurrentToolDisplay,
};
