import fs from 'fs/promises';
import path from 'path';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const TREE_CACHE_TTL_MS = 1_000;
const GLOBAL_TREE_CACHE_KEY = '__DEVHUB_FS_TREE_CACHE__';
const IGNORED_SEGMENTS = new Set(['.git', '.next', 'node_modules', 'dist', 'build', 'coverage']);
const IGNORED_PATHS = [path.join('src-tauri', 'target')];

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

function shouldIgnoreEntry(relativePath) {
  const normalizedSegments = normalizePathSegments(relativePath);
  if (normalizedSegments.some((segment) => IGNORED_SEGMENTS.has(segment))) {
    return true;
  }

  const normalizedPath = normalizedSegments.join('/');
  return IGNORED_PATHS.some((ignoredPath) => {
    const normalizedIgnoredPath = ignoredPath.split(path.sep).join('/');
    return normalizedPath === normalizedIgnoredPath || normalizedPath.startsWith(`${normalizedIgnoredPath}/`);
  });
}

async function buildFileTree(dirPath, rootPath = dirPath) {
  const result = [];
  const items = await fs.readdir(dirPath, { withFileTypes: true });

  for (const item of items) {
    const fullPath = path.join(dirPath, item.name);
    const relativePath = path.relative(rootPath, fullPath);
    if (shouldIgnoreEntry(relativePath)) {
      continue;
    }
    
    const node = {
      name: item.name,
      path: relativePath,
      type: item.isDirectory() ? 'directory' : 'file',
    };

    if (item.isDirectory()) {
      node.children = await buildFileTree(fullPath, rootPath);
    }

    result.push(node);
  }

  result.sort((a, b) => {
    if (a.type === b.type) {
      return a.name.localeCompare(b.name);
    }
    return a.type === 'directory' ? -1 : 1;
  });

  return result;
}

export async function GET(request) {
  // Nota: Next.js 'force-static' con API Routes dinamicas arroja 500 al compilar
  // Se ignora el condicional process.env.NODE_ENV ya que se invoca on-demand
  
  try {
    const { searchParams } = new URL(request.url);
    const baseDir = searchParams.get('base') || process.cwd();
    const cache = getTreeCache();
    const cachedEntry = cache.get(baseDir);

    // Comprobamos si la ruta en verdad existe
    await fs.access(baseDir);

    if (cachedEntry && cachedEntry.expiresAt > Date.now()) {
      return NextResponse.json({ root: baseDir, tree: cachedEntry.tree });
    }

    const tree = await buildFileTree(baseDir, baseDir);
    cache.set(baseDir, {
      tree,
      expiresAt: Date.now() + TREE_CACHE_TTL_MS,
    });
    return NextResponse.json({ root: baseDir, tree });
  } catch (error) {
    console.error('Error reading file tree:', error);
    return NextResponse.json({ error: 'Failed to read file system' }, { status: 500 });
  }
}
