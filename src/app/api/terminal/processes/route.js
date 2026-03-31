import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'API route not available in static export build.' },
      { status: 501 }
    );
  }

  try {
    return NextResponse.json({ processes: [] });
  } catch (error) {
    console.error('Failed to detect terminal processes:', error);
    return NextResponse.json(
      { error: 'No se pudo leer el estado de sesiones de terminal.' },
      { status: 500 }
    );
  }
}
