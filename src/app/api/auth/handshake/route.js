import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Store the handshake map in global scope to persist across hot-reloads in dev mode
if (!global.authHandshakeMap) {
  global.authHandshakeMap = new Map();
}

const handshakeMap = global.authHandshakeMap;
const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// Clean up expired entries
function cleanupExpired() {
  const now = Date.now();
  for (const [key, value] of handshakeMap.entries()) {
    if (now - value.timestamp > TIMEOUT_MS) {
      handshakeMap.delete(key);
    }
  }
}

export async function GET(request) {
  cleanupExpired();
  const { searchParams } = new URL(request.url);
  const authRequestId = searchParams.get('auth_request_id');

  if (!authRequestId) {
    return NextResponse.json({ error: 'Missing auth_request_id parameter' }, { status: 400 });
  }

  const entry = handshakeMap.get(authRequestId);
  if (entry) {
    // Consume the session (only return once)
    handshakeMap.delete(authRequestId);
    return NextResponse.json({ status: 'success', session: entry.session });
  }

  return NextResponse.json({ status: 'pending' });
}

export async function POST(request) {
  cleanupExpired();
  try {
    const body = await request.json();
    const { auth_request_id, session } = body;

    if (!auth_request_id || !session) {
      return NextResponse.json({ error: 'Missing auth_request_id or session' }, { status: 400 });
    }

    handshakeMap.set(auth_request_id, {
      session,
      timestamp: Date.now(),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Handshake registration failed:', error);
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
}
