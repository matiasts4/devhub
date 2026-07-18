import fs from 'fs/promises';
import path from 'path';
import { HEAVY_DIR_NAMES } from './pathSandbox';

const IGNORED_PATH_PREFIXES = ['tmp_', 'tmp-'];

function toPosixRelative(rootPath, fullPath) {
  return path.relative(rootPath, fullPath).split(path.sep).join('/');
}

function shouldIgnoreEntry(relativePath) {
  const segments = String(relativePath || '')
    .split('/')
    .filter(Boolean);
  if (segments.some((segment) => HEAVY_DIR_NAMES.has(segment))) return true;
  const leaf = segments[segments.length - 1] || '';
  return IGNORED_PATH_PREFIXES.some((prefix) => leaf.startsWith(prefix));
}

function sortTreeNodes(nodes) {
  nodes.sort((a, b) => {
    if (a.type === b.type) return a.name.localeCompare(b.name);
    return a.type === 'directory' ? -1 : 1;
  });
  return nodes;
}

export async function listDirectoryEntries(dirPath, rootPath) {
  const items = await fs.readdir(dirPath, { withFileTypes: true });
  const nodes = [];

  for (const item of items) {
    const fullPath = path.join(dirPath, item.name);
    const relativePath = toPosixRelative(rootPath, fullPath);
    if (shouldIgnoreEntry(relativePath)) continue;

    if (item.isDirectory()) {
      nodes.push({
        name: item.name,
        path: relativePath,
        type: 'directory',
        children: null,
      });
    } else {
      nodes.push({
        name: item.name,
        path: relativePath,
        type: 'file',
      });
    }
  }

  return sortTreeNodes(nodes);
}
