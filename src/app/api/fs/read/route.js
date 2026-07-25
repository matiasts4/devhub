import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const filePathParam = searchParams.get('path');
    const basePath = searchParams.get('base') || process.cwd();

    if (!filePathParam) {
      return NextResponse.json({ error: 'Ruta de archivo no proporcionada.' }, { status: 400 });
    }

    const absolutePath = path.resolve(/*turbopackIgnore: true*/ basePath, filePathParam);

    const content = await fs.readFile(/*turbopackIgnore: true*/ absolutePath, 'utf8');
    return NextResponse.json({ content });
  } catch (error) {
    console.error('Error api/fs/read:', error);
    return NextResponse.json(
      { error: error.message || 'Error al leer el archivo.' },
      { status: 500 }
    );
  }
}
