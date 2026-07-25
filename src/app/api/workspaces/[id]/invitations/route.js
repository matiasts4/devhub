import { NextResponse } from 'next/server';
import { createInviteToken, inviteExpiresAt } from '@/lib/invitations/token';
import { getSupabaseAdmin, isCloudAuthEnabled } from '@/lib/invitations/supabaseAdmin';

export const dynamic = 'force-dynamic';

function siteOrigin(req) {
  return process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl?.origin || 'http://127.0.0.1:3400';
}

export async function POST(req, { params }) {
  if (!isCloudAuthEnabled()) {
    return NextResponse.json(
      { error: 'Invitaciones solo disponibles en modo cloud' },
      { status: 400 }
    );
  }

  try {
    const { id: workspaceId } = await params;
    const { email, role = 'member', invitedBy } = await req.json();

    if (!email || !workspaceId) {
      return NextResponse.json({ error: 'workspaceId y email son requeridos' }, { status: 400 });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const allowedRoles = new Set(['admin', 'member', 'viewer']);
    const normalizedRole = allowedRoles.has(role) ? role : 'member';

    const admin = getSupabaseAdmin();
    const token = createInviteToken();
    const expiresAt = inviteExpiresAt(7);

    const { error } = await admin.from('workspace_invitations').upsert(
      {
        workspace_id: workspaceId,
        email: normalizedEmail,
        role: normalizedRole,
        token,
        expires_at: expiresAt,
        status: 'pending',
        invited_by: invitedBy || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'workspace_id,email' }
    );

    if (error) {
      console.error('workspace invitation error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const inviteUrl = `${siteOrigin(req)}/invitations/${token}`;

    return NextResponse.json({
      success: true,
      inviteUrl,
      token,
      expiresAt,
      message: `Invitación creada para ${normalizedEmail}`,
    });
  } catch (error) {
    console.error('workspace invitation route failed:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
