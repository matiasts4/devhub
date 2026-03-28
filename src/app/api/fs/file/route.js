import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import path from 'path';

const mimeTypes = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg'
};

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const filePathParam = searchParams.get('path');
    const basePath = searchParams.get('base') || process.cwd();

    if (!filePathParam) {
      return NextResponse.json({ error: 'Ruta no proporcionada' }, { status: 400 });
    }

    const absolutePath = path.resolve(basePath, filePathParam);

    // En un entorno de escritorio local asumiremos confianza en localhost
    // Si quisieras restringirlo de vuelta pon aquí la lógica de path traversal.

    const ext = path.extname(absolutePath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    
    const fileBuffer = await fs.readFile(absolutePath);
    
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
      }
    });

  } catch (error) {
    console.error('Error in /api/fs/file:', error);
    return NextResponse.json({ error: 'Error al cargar archivo' }, { status: 500 });
  }
}
