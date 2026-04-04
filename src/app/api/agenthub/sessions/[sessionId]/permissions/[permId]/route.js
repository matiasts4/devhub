import { NextResponse } from 'next/server';

const OPENCODE_PORT = process.env.OPENCODE_PORT || 4153;
const OPENCODE_URL = `http://127.0.0.1:${OPENCODE_PORT}`;

export async function POST(req, { params }) {
  try {
    const { sessionId, permId } = await params;
    const body = await req.json();

    const { action } = body;

    if (!action || !['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: "action must be 'approve' or 'reject'" }, { status: 400 });
    }

    const res = await fetch(`${OPENCODE_URL}/session/${sessionId}/permissions/${permId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json({ error: `OpenCode API error: ${errText}` }, { status: res.status });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Error handling permission:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
