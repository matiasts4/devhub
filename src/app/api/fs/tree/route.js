import fs from 'fs/promises';
import path from 'path';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const TREE_CACHE_TTL_MS = 60_000;
const GLOBAL_TREE_CACHE_KEY = '__DEVHUB_FS_TREE_CACHE__';
const IGNORED_SEGMENTS = new Set([
  '.git',
  '.next',
  '.turbo',
  '.cache',
  '.vercel',
  '.venv',
  'venv',
  '__pycache__',
  'node_modules',
  'dist',
  'build',
  'coverage',
  'out',
  'target',
  'graphify-out',
  '.pnpm-store',
]);
const IGNORED_PATH_PREFIXES = ['tmp_', 'tmp-'];
const SEARCH_MAX_MATCHES = 250;
const SEARCH_MAX_DIRS = 2_500;

function getTreeCache() {
  if (!globalThis[GLOBAL_TREE_CACHE_KEY]) {
    globalThis[GLOBAL_TREE_CACHE_KEY] = new Map();
  }

  return globalThis[GLOBAL_TREE_CACHE_KEY];
}

function normalizePathSegments(value) {
  return String(value || '')
    .split(path.sep)
    .join('/')
    .split('/')
    .filter(Boolean);
}

function toPosixRelative(rootPath, fullPath) {
  return path.relative(rootPath, fullPath).split(path.sep).join('/');
}

function shouldIgnoreEntry(relativePath) {
  const normalizedSegments = normalizePathSegments(relativePath);
  if (normalizedSegments.some((segment) => IGNORED_SEGMENTS.has(segment))) {
    return true;
  }

  const leaf = normalizedSegments[normalizedSegments.length - 1] || '';
  if (IGNORED_PATH_PREFIXES.some((prefix) => leaf.startsWith(prefix))) {
    return true;
  }

  return false;
}

function sortTreeNodes(nodes) {
  nodes.sort((a, b) => {
    if (a.type === b.type) {
      return a.name.localeCompare(b.name);
    }
    return a.type === 'directory' ? -1 : 1;
  });
  return nodes;
}

function cacheKey({ baseDir, dir, mode, query }) {
  return `${baseDir}::${dir || ''}::${mode}::${query || ''}`;
}

async function listDirectoryEntries(dirPath, rootPath) {
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
        // null = not loaded yet (lazy). [] = loaded empty.
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

async function buildFileTreeRecursive(dirPath, rootPath) {
  const items = await fs.readdir(dirPath, { withFileTypes: true });
  const pending = [];

  for (const item of items) {
    const fullPath = path.join(dirPath, item.name);
    const relativePath = toPosixRelative(rootPath, fullPath);
    if (shouldIgnoreEntry(relativePath)) continue;

    if (item.isDirectory()) {
      pending.push(
        buildFileTreeRecursive(fullPath, rootPath).then((children) => ({
          name: item.name,
          path: relativePath,
          type: 'directory',
          children,
        }))
      );
    } else {
      pending.push(
        Promise.resolve({
          name: item.name,
          path: relativePath,
          type: 'file',
        })
      );
    }
  }

  return sortTreeNodes(await Promise.all(pending));
}

function insertMatchIntoTree(rootNodes, relativePath, type) {
  const segments = normalizePathSegments(relativePath);
  if (segments.length === 0) return;

  let cursor = rootNodes;
  let built = '';

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    built = built ? `${built}/${segment}` : segment;
    const isLeaf = index === segments.length - 1;
    let node = cursor.find((entry) => entry.path === built);

    if (!node) {
      node = isLeaf
        ? type === 'directory'
          ? { name: segment, path: built, type: 'directory', children: [] }
          : { name: segment, path: built, type: 'file' }
        : { name: segment, path: built, type: 'directory', children: [] };
      cursor.push(node);
      sortTreeNodes(cursor);
    }

    if (!isLeaf) {
      if (!Array.isArray(node.children)) node.children = [];
      cursor = node.children;
    } else if (type === 'directory' && !Array.isArray(node.children)) {
      node.children = [];
    }
  }
}

async function searchFileTree(rootPath, query) {
  const normalizedQuery = String(query || '')
    .trim()
    .toLowerCase();
  if (!normalizedQuery) return [];

  const matches = [];
  const queue = [rootPath];
  let visitedDirs = 0;

  while (queue.length > 0 && matches.length < SEARCH_MAX_MATCHES && visitedDirs < SEARCH_MAX_DIRS) {
    const currentDir = queue.shift();
    visitedDirs += 1;

    let items;
    try {
      items = await fs.readdir(currentDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const item of items) {
      const fullPath = path.join(currentDir, item.name);
      const relativePath = toPosixRelative(rootPath, fullPath);
      if (shouldIgnoreEntry(relativePath)) continue;

      const haystack = `${item.name} ${relativePath}`.toLowerCase();
      const isMatch = haystack.includes(normalizedQuery);

      if (item.isDirectory()) {
        if (isMatch) {
          matches.push({ path: relativePath, type: 'directory' });
        }
        queue.push(fullPath);
      } else if (isMatch) {
        matches.push({ path: relativePath, type: 'file' });
      }

      if (matches.length >= SEARCH_MAX_MATCHES) break;
    }
  }

  const tree = [];
  for (const match of matches) {
    insertMatchIntoTree(tree, match.path, match.type);
  }
  return tree;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const baseDir = searchParams.get('base') || process.cwd();
    const dirParam = searchParams.get('dir') || '';
    const query = searchParams.get('q') || '';
    const recursive = searchParams.get('recursive') === '1';
    const fresh = searchParams.get('fresh') === '1';
    const mode = query ? 'search' : recursive ? 'recursive' : 'shallow';

    await fs.access(baseDir);

    const relativeDir = normalizePathSegments(dirParam).join('/');
    const targetDir = relativeDir ? path.join(baseDir, ...relativeDir.split('/')) : baseDir;
    const resolvedTarget = path.resolve(targetDir);
    const resolvedBase = path.resolve(baseDir);
    if (
      resolvedTarget !== resolvedBase &&
      !resolvedTarget.startsWith(`${resolvedBase}${path.sep}`)
    ) {
      return NextResponse.json({ error: 'Invalid directory path' }, { status: 400 });
    }

    const key = cacheKey({ baseDir: resolvedBase, dir: relativeDir, mode, query });
    const cache = getTreeCache();
    const cachedEntry = cache.get(key);

    if (!fresh && cachedEntry && cachedEntry.expiresAt > Date.now()) {
      return NextResponse.json({
        root: resolvedBase,
        dir: relativeDir || '',
        mode,
        tree: cachedEntry.tree,
        cached: true,
      });
    }

    let tree;
    if (mode === 'search') {
      tree = await searchFileTree(resolvedBase, query);
    } else if (mode === 'recursive') {
      tree = await buildFileTreeRecursive(resolvedTarget, resolvedBase);
    } else {
      tree = await listDirectoryEntries(resolvedTarget, resolvedBase);
    }

    cache.set(key, {
      tree,
      expiresAt: Date.now() + TREE_CACHE_TTL_MS,
    });

    return NextResponse.json({
      root: resolvedBase,
      dir: relativeDir || '',
      mode,
      tree,
      cached: false,
    });
  } catch (error) {
    console.error('Error reading file tree:', error);
    return NextResponse.json({ error: 'Failed to read file system' }, { status: 500 });
  }
}
