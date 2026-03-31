import { NextResponse } from 'next/server';

// Local-first: invite system not needed (single user)
// Redirect to hub
export async function GET(req, { params }) {
  const { token } = params;
  // In local mode, invites are not used
  return NextResponse.redirect(new URL('/hub', req.url));
}
