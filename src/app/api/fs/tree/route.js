import fs from 'fs/promises';
import path from 'path';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

async function buildFileTree(dirPath, rootPath = dirPath) {
  const result = [];
  const items = await fs.readdir(dirPath, { withFileTypes: true });

  for (const item of items) {
    if (item.name === 'node_modules' || item.name === '.git') {
      continue;
    }

    const fullPath = path.join(dirPath, item.name);
    const relativePath = path.relative(rootPath, fullPath);
    
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

    // Comprobamos si la ruta en verdad existe
    await fs.access(baseDir);

    const tree = await buildFileTree(baseDir, baseDir);
    return NextResponse.json({ root: baseDir, tree });
  } catch (error) {
    console.error('Error reading file tree:', error);
    return NextResponse.json({ error: 'Failed to read file system' }, { status: 500 });
  }
}
