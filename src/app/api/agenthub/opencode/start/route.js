import { NextResponse } from 'next/server';
import processManager from '@/lib/swarm/processManager';

export async function POST() {
  try {
    const info = await processManager.ensure();
    return NextResponse.json({ success: true, info });
  } catch (err) {
    console.error('Error starting OpenCode:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const status = await processManager.getStatus();
    return NextResponse.json({ success: true, status });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
