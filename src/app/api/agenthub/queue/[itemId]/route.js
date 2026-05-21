import { NextResponse } from 'next/server';
import swarmQueue from '@/lib/swarm/queue';

export const runtime = 'nodejs';

export async function DELETE(req, { params }) {
  try {
    const { itemId } = params;
    if (!itemId) {
      return NextResponse.json({ error: 'itemId required' }, { status: 400 });
    }
    const removed = swarmQueue.remove(itemId);
    return NextResponse.json({ success: true, removed });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
