export function joinPath(parent, name) {
  if (!parent) return name;
  if (parent.endsWith('/')) return `${parent}${name}`;
  return `${parent}/${name}`;
}

export function dirname(path) {
  if (!path) return '';
  const i = path.lastIndexOf('/');
  if (i <= 0) return '';
  return path.slice(0, i);
}

export function basename(path) {
  const parts = String(path || '')
    .split(/[\\/]/)
    .filter(Boolean);
  return parts.length ? parts[parts.length - 1] : path || '';
}

export function isUnder(key, root) {
  if (!root) return true;
  return key === root || key.startsWith(`${root}/`);
}

export function sameDirListing(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (
      a[i].name !== b[i].name ||
      a[i].kind !== b[i].kind ||
      Boolean(a[i].gitignored) !== Boolean(b[i].gitignored)
    ) {
      return false;
    }
  }
  return true;
}

/** Convert /api/fs/tree nodes → DirEntry shape used by useFileTree. */
export function treeNodesToEntries(nodes) {
  return (nodes || []).map((node) => ({
    name: node.name,
    kind: node.type === 'directory' ? 'dir' : 'file',
    path: node.path,
    gitignored: Boolean(node.gitignored),
  }));
}
