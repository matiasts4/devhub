/* global require, module */
const { normalizeBrowserUrl } = require('./rightDockState');

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function urlsLooselyEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  try {
    const left = new URL(String(a));
    const right = new URL(String(b));
    const normalizePath = (path) => {
      if (!path || path === '/') return '/';
      return path.endsWith('/') ? path.slice(0, -1) : path;
    };
    return (
      left.protocol === right.protocol &&
      left.host === right.host &&
      normalizePath(left.pathname) === normalizePath(right.pathname) &&
      left.search === right.search &&
      left.hash === right.hash
    );
  } catch {
    return String(a).replace(/\/$/, '') === String(b).replace(/\/$/, '');
  }
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

  if (urlsLooselyEqual(activeEntry, normalizedUrl)) {
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

/**
 * Sync URL reported by the native WebView (in-page links, redirects, back/forward paint).
 * Must NOT truncate the forward stack when the URL already exists in history — that is what
 * made "atrás muchas veces → adelante ya no existe".
 */
function syncBrowserUrlFromNative(currentState, nextUrl) {
  const normalizedUrl = normalizeBrowserUrl(nextUrl) || String(nextUrl || '').trim();
  if (!normalizedUrl) {
    return currentState;
  }

  const history = Array.isArray(currentState?.browserHistory)
    ? currentState.browserHistory.filter(Boolean)
    : [];
  const index = Number.isFinite(Number(currentState?.browserHistoryIndex))
    ? Number(currentState.browserHistoryIndex)
    : Math.max(history.length - 1, 0);

  if (history.length === 0) {
    return {
      ...currentState,
      browserUrl: normalizedUrl,
      browserHistory: [normalizedUrl],
      browserHistoryIndex: 0,
    };
  }

  // Same entry (or loose match) at current index — keep stack intact.
  if (urlsLooselyEqual(history[index], normalizedUrl)) {
    if (currentState.browserUrl === history[index] || currentState.browserUrl === normalizedUrl) {
      return currentState;
    }
    return {
      ...currentState,
      browserUrl: history[index],
    };
  }

  // Prefer moving the index to an existing history entry (back/forward or revisit).
  const foundIndex = history.findIndex((entry) => urlsLooselyEqual(entry, normalizedUrl));
  if (foundIndex >= 0) {
    return {
      ...currentState,
      browserUrl: history[foundIndex],
      browserHistory: history,
      browserHistoryIndex: foundIndex,
    };
  }

  // Genuine new navigation from inside the page → append (truncate forward from here).
  return commitBrowserNavigation(currentState, normalizedUrl);
}

module.exports = {
  commitBrowserNavigation,
  moveBrowserHistory,
  syncBrowserUrlFromNative,
  urlsLooselyEqual,
};
