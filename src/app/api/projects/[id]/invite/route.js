import { NextResponse } from 'next/server';
import { createInviteToken, inviteExpiresAt } from '@/lib/invitations/token';
import { getSupabaseAdmin, isCloudAuthEnabled } from '@/lib/invitations/supabaseAdmin';
import { getCurrentUser } from '@/lib/auth/apiAuth';

export const dynamic = 'force-dynamic';

function siteOrigin(req) {
  return process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl?.origin || 'http://127.0.0.1:3400';
}

async function resolveParams(params) {
  return typeof params?.then === 'function' ? await params : params;
}

export async function POST(req, { params }) {
  if (!isCloudAuthEnabled()) {
    return NextResponse.json(
      { error: 'Invitaciones solo disponibles en modo cloud' },
      { status: 400 }
    );
  }

  try {
    const { id: projectId } = await resolveParams(params);
    const actor = await getCurrentUser();
    if (!actor) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { email, role = 'member' } = body;

    if (!email || !projectId) {
      return NextResponse.json({ error: 'projectId y email son requeridos' }, { status: 400 });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const allowedRoles = new Set(['admin', 'member', 'viewer']);
    const normalizedRole = allowedRoles.has(role) ? role : 'member';

    const admin = getSupabaseAdmin();

    // Verify inviter is owner or admin of the project
    const { data: membership } = await admin
      .from('project_members')
      .select('role')
      .eq('project_id', projectId)
      .eq('user_id', actor.id)
      .maybeSingle();

    const canInvite = membership?.role === 'owner' || membership?.role === 'admin';
    if (!canInvite) {
      return NextResponse.json(
        { error: 'No tienes permiso para invitar a este proyecto' },
        { status: 403 }
      );
    }

    const token = createInviteToken();
    const expiresAt = inviteExpiresAt(7);

    const { error } = await admin.from('project_invitations').upsert(
      {
        project_id: projectId,
        email: normalizedEmail,
        role: normalizedRole,
        token,
        expires_at: expiresAt,
        status: 'pending',
        invited_by: actor.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'project_id,email' }
    );

    if (error) {
      console.error('project invitation error:', error);
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
    console.error('project invitation route failed:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
