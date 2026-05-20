const DEFAULT_BROWSER_URL = 'http://localhost:3200/';
const DEFAULT_SEARCH_URL = 'https://duckduckgo.com/?q=';
const MIN_RIGHT_DOCK_SIZE = 20;
const MAX_RIGHT_DOCK_SIZE = 82;

const DEFAULT_RIGHT_DOCK_STATE = {
  visible: false,
  activeTab: 'browser',
  browserRuntime: 'iframe',
  editMode: false,
  maximized: false,
  maximizedView: 'browser',
  size: 44,
  browserUrl: DEFAULT_BROWSER_URL,
  browserHistory: [DEFAULT_BROWSER_URL],
  browserHistoryIndex: 0,
};

function buildRightDockStorageKey(projectId, wsId) {
  const base = `devhub_right_dock_${projectId || 'global'}`;
  return wsId ? `${base}_${wsId}` : base;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function isValidBrowserHostname(hostname) {
  if (!hostname) return false;
  const normalized = hostname.toLowerCase();
  if (normalized === 'localhost') return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(normalized)) return true;
  if (normalized.startsWith('[') && normalized.endsWith(']')) return true;
  if (/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(normalized) && !/^\d+$/.test(normalized)) return true;
  return normalized.includes('.');
}

function buildSearchUrl(query) {
  return `${DEFAULT_SEARCH_URL}${encodeURIComponent(String(query || '').trim())}`;
}

function shouldTreatAsSearchQuery(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return false;
  if (/^(https?:\/\/|file:\/\/)/i.test(normalized)) return false;
  if (/^about:/i.test(normalized)) return false;
  if (/\s/.test(normalized)) return true;
  if (/^:(\d+)(\/.*)?$/.test(normalized) || /^(\d+)(\/.*)?$/.test(normalized)) return false;
  if (
    normalized === 'localhost' ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(normalized) ||
    /^\[[0-9a-f:]+\]$/i.test(normalized)
  ) {
    return false;
  }
  if (normalized.includes('.')) return false;
  if (/^[a-z0-9-]+:\d+(\/.*)?$/i.test(normalized)) return false;
  if (/^[a-z0-9-]+\/.+$/i.test(normalized)) return false;
  if (/^[a-z0-9-]+$/i.test(normalized)) return true;
  return true;
}

function shouldDefaultToHttp(value) {
  const normalized = String(value || '').trim().replace(/^\/\//, '');
  if (!normalized) return false;

  const hostnameCandidate = normalized.split('/')[0].split('?')[0].split('#')[0];
  const hostname = hostnameCandidate.split(':')[0].toLowerCase();

  if (!hostname) return false;
  if (hostname === 'localhost') return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return true;
  if (/^\[[0-9a-f:]+\]$/i.test(hostname)) return true;
  if (hostname.endsWith('.local')) return true;
  if (!hostname.includes('.')) return true;

  return false;
}

function normalizeBrowserUrl(rawValue) {
  const value = String(rawValue || '').trim();
  if (!value) return '';
  if (value === 'about:blank') return value;

  if (shouldTreatAsSearchQuery(value)) {
    return buildSearchUrl(value);
  }

  const localhostShortcut = /^:(\d+)(\/.*)?$/.exec(value) || /^(\d+)(\/.*)?$/.exec(value);
  if (localhostShortcut) {
    const [, port, path = ''] = localhostShortcut;
    return `http://localhost:${port}${path || '/'}`;
  }

  const hasExplicitProtocol = /^(https?:\/\/|file:\/\/)/i.test(value);
  const withProtocol = hasExplicitProtocol
    ? value
    : `${shouldDefaultToHttp(value) ? 'http' : 'https'}://${value.replace(/^\/\//, '')}`;

  try {
    const parsed = new URL(withProtocol);
    if (parsed.protocol === 'file:') {
      return parsed.toString();
    }
    if (!isValidBrowserHostname(parsed.hostname)) {
      return '';
    }
    return parsed.toString();
  } catch {
    if (!hasExplicitProtocol && shouldTreatAsSearchQuery(value)) {
      return buildSearchUrl(value);
    }
    return '';
  }
}

function sanitizeRightDockState(rawState = {}) {
  const visible = rawState.visible === true;
  const isLegacyBridgeTab = rawState.activeTab === 'bridge';
  const activeTab = ['browser', 'editor'].includes(rawState.activeTab) ? rawState.activeTab : 'browser';
  const browserRuntime = rawState.browserRuntime === 'native-gtk' ? 'native-gtk' : 'iframe';
  const editMode = rawState.editMode === true || isLegacyBridgeTab;
  const maximized = rawState.maximized === true;
  const maximizedView = ['browser', 'editor', 'window'].includes(rawState.maximizedView)
    ? rawState.maximizedView
    : (activeTab === 'editor' ? 'editor' : 'browser');
  const rawSize = Number(rawState.size);
  const size = Number.isFinite(rawSize)
    ? clamp(rawSize, MIN_RIGHT_DOCK_SIZE, MAX_RIGHT_DOCK_SIZE)
    : DEFAULT_RIGHT_DOCK_STATE.size;

  const normalizedHistory = Array.isArray(rawState.browserHistory)
    ? rawState.browserHistory
        .map((entry) => normalizeBrowserUrl(entry))
        .filter((entry, index, array) => entry && array.indexOf(entry) === index)
    : [];

  const normalizedUrl =
    normalizeBrowserUrl(rawState.browserUrl) ||
    normalizedHistory[0] ||
    DEFAULT_RIGHT_DOCK_STATE.browserUrl;

  const browserHistory = normalizedHistory.length > 0 ? normalizedHistory : [normalizedUrl];
  const browserHistoryIndex = clamp(
    Number.isFinite(Number(rawState.browserHistoryIndex)) ? Number(rawState.browserHistoryIndex) : 0,
    0,
    browserHistory.length - 1
  );

  const browserUrl = browserHistory[browserHistoryIndex] || normalizedUrl;

  return {
    visible,
    activeTab,
    browserRuntime,
    editMode,
    maximized,
    maximizedView,
    size,
    browserUrl,
    browserHistory,
    browserHistoryIndex,
  };
}

function readRightDockState(storage, projectId, wsId) {
  if (!storage || typeof storage.getItem !== 'function') {
    return { ...DEFAULT_RIGHT_DOCK_STATE };
  }

  try {
    const raw = storage.getItem(buildRightDockStorageKey(projectId, wsId));
    if (!raw) return { ...DEFAULT_RIGHT_DOCK_STATE };
    const state = sanitizeRightDockState(JSON.parse(raw));
    writeRightDockState(storage, projectId, wsId, state);
    return state;
  } catch {
    return { ...DEFAULT_RIGHT_DOCK_STATE };
  }
}

function writeRightDockState(storage, projectId, wsId, state) {
  if (!storage || typeof storage.setItem !== 'function') return;

  try {
    storage.setItem(
      buildRightDockStorageKey(projectId, wsId),
      JSON.stringify(sanitizeRightDockState(state))
    );
  } catch {
    // Ignore storage failures.
  }
}

module.exports = {
  DEFAULT_BROWSER_URL,
  DEFAULT_RIGHT_DOCK_STATE,
  MAX_RIGHT_DOCK_SIZE,
  MIN_RIGHT_DOCK_SIZE,
  buildRightDockStorageKey,
  normalizeBrowserUrl,
  readRightDockState,
  sanitizeRightDockState,
  writeRightDockState,
};
