const { normalizeBrowserUrl } = require('./rightDockState');

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function commitBrowserNavigation(currentState, nextUrl) {
  const normalizedUrl = normalizeBrowserUrl(nextUrl);
  if (!normalizedUrl) {
    return currentState;
  }

  const history = Array.isArray(currentState?.browserHistory)
    ? currentState.browserHistory.filter(Boolean)
    : [];
  const index = Number.isFinite(Number(currentState?.browserHistoryIndex))
    ? Number(currentState.browserHistoryIndex)
    : history.length - 1;
  const activeEntry = history[index] || currentState?.browserUrl || '';

  if (activeEntry === normalizedUrl) {
    return {
      ...currentState,
      browserUrl: normalizedUrl,
      browserHistory: history.length > 0 ? history : [normalizedUrl],
      browserHistoryIndex: history.length > 0 ? index : 0,
    };
  }

  const truncatedHistory = history.slice(0, index + 1).filter(Boolean);
  truncatedHistory.push(normalizedUrl);

  return {
    ...currentState,
    browserUrl: normalizedUrl,
    browserHistory: truncatedHistory,
    browserHistoryIndex: truncatedHistory.length - 1,
  };
}

function moveBrowserHistory(currentState, delta) {
  const history = Array.isArray(currentState?.browserHistory)
    ? currentState.browserHistory.filter(Boolean)
    : [];

  if (history.length === 0) {
    return {
      ...currentState,
      browserHistory: [],
      browserHistoryIndex: 0,
    };
  }

  const currentIndex = Number.isFinite(Number(currentState?.browserHistoryIndex))
    ? Number(currentState.browserHistoryIndex)
    : history.length - 1;
  const nextIndex = clamp(currentIndex + delta, 0, history.length - 1);

  return {
    ...currentState,
    browserHistory: history,
    browserHistoryIndex: nextIndex,
    browserUrl: history[nextIndex],
  };
}

module.exports = {
  commitBrowserNavigation,
  moveBrowserHistory,
};
