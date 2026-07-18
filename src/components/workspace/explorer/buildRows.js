import { joinPath } from './pathUtils';

/**
 * Flatten expanded tree state into fixed-height rows for virtualization.
 */
export function buildRows(rootPath, tree, lookupGitStatus = () => null) {
  const rows = [];
  const entryIndexByPath = new Map();
  const rootKey = rootPath || '';

  const walk = (parent, depth, parentIgnored) => {
    const node = tree.nodes[parent];
    if (!node || node.status !== 'loaded') return;

    for (const entry of node.entries) {
      const path = entry.path || joinPath(parent, entry.name);
      const isDir = entry.kind === 'dir';
      const expanded = isDir && tree.expanded.has(path);
      const isRenaming = tree.renaming === path;
      const gitignored = parentIgnored || Boolean(entry.gitignored);
      const gitStatusCode = gitignored ? null : lookupGitStatus(path);

      if (isRenaming) {
        rows.push({
          kind: 'rename',
          key: `rename:${path}`,
          path,
          name: entry.name,
          isDir,
          depth,
          gitignored,
          gitStatusCode,
        });
      } else {
        entryIndexByPath.set(path, rows.length);
        rows.push({
          kind: 'entry',
          key: path,
          path,
          name: entry.name,
          isDir,
          isExpanded: expanded,
          depth,
          gitignored,
          gitStatusCode,
        });
      }

      if (isDir && expanded) {
        const child = tree.nodes[path];
        if (tree.pendingCreate?.parentPath === path) {
          rows.push({
            kind: 'pending',
            key: `pending:${path}`,
            depth: depth + 1,
            pendingKind: tree.pendingCreate.kind,
          });
        }
        if (child?.status === 'loading') {
          rows.push({
            kind: 'status',
            key: `loading:${path}`,
            depth: depth + 1,
            tone: 'muted',
            message: 'Loading…',
          });
        } else if (child?.status === 'error') {
          rows.push({
            kind: 'status',
            key: `error:${path}`,
            depth: depth + 1,
            tone: 'error',
            message: child.message,
          });
        } else if (child?.status === 'loaded') {
          walk(path, depth + 1, gitignored);
        }
      }
    }
  };

  if (tree.pendingCreate?.parentPath === rootKey) {
    rows.push({
      kind: 'pending',
      key: `pending:${rootKey || 'root'}`,
      depth: 0,
      pendingKind: tree.pendingCreate.kind,
    });
  }

  const root = tree.nodes[rootKey];
  if (root?.status === 'loading') {
    rows.push({
      kind: 'status',
      key: 'loading:root',
      depth: 0,
      tone: 'muted',
      message: 'Loading…',
    });
  } else if (root?.status === 'error') {
    rows.push({
      kind: 'status',
      key: 'error:root',
      depth: 0,
      tone: 'error',
      message: root.message,
    });
  } else if (root?.status === 'loaded') {
    walk(rootKey, 0, false);
  }

  return { rows, entryIndexByPath };
}
