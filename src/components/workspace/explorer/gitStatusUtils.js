export function normalizePath(path) {
  return String(path || '')
    .replace(/\\/g, '/')
    .replace(/\/+$/, '');
}

function normalizeStatusCode(status) {
  switch (
    String(status || '')
      .trim()
      .toUpperCase()
  ) {
    case '?':
    case 'U':
      return 'U';
    case 'A':
      return 'A';
    case 'D':
      return 'D';
    case 'R':
    case 'C':
      return 'R';
    default:
      return 'M';
  }
}

export function statusCodeForFile(file) {
  if (file.untracked) return 'U';
  if (file.indexStatus === 'U' || file.worktreeStatus === 'U') return 'U';
  const primary = file.unstaged ? file.worktreeStatus : file.indexStatus;
  const fallback = file.unstaged ? file.indexStatus : file.worktreeStatus;
  return normalizeStatusCode(primary !== ' ' ? primary : fallback);
}

export function buildGitStatusMap(status) {
  const map = new Map();
  for (const file of status.changedFiles || []) {
    map.set(normalizePath(file.path), statusCodeForFile(file));
  }
  return map;
}

const DIR_PRIORITY = { M: 5, U: 4, A: 3, R: 2, D: 1 };

export function bubbleUpDirectoryStatuses(map) {
  for (const [path, code] of [...map.entries()]) {
    const segs = path.split('/');
    segs.pop();
    let prefix = '';
    for (const seg of segs) {
      prefix = prefix ? `${prefix}/${seg}` : seg;
      const existing = map.get(prefix);
      if (!existing || DIR_PRIORITY[code] > DIR_PRIORITY[existing]) {
        map.set(prefix, code);
      }
    }
  }
}

export function lookupGitStatus(map, relativePath) {
  if (!map || !relativePath) return map?.get('') ?? null;
  return map.get(normalizePath(relativePath)) ?? null;
}
