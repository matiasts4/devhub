import { NextResponse } from 'next/server';
import { getSupabaseAdmin, isCloudAuthEnabled } from '@/lib/invitations/supabaseAdmin';
import { getCurrentUser } from '@/lib/auth/apiAuth';

export const dynamic = 'force-dynamic';

async function resolveParams(params) {
  return typeof params?.then === 'function' ? await params : params;
}

async function assertCanManageProject(admin, projectId, userId) {
  const { data: membership } = await admin
    .from('project_members')
    .select('role')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .maybeSingle();

  const canManage = membership?.role === 'owner' || membership?.role === 'admin';
  return { canManage, role: membership?.role || null };
}

export async function GET(req, { params }) {
  if (!isCloudAuthEnabled()) {
    return NextResponse.json({ invitations: [] });
  }

  try {
    const { id: projectId } = await resolveParams(params);
    const actor = await getCurrentUser();
    if (!actor) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const admin = getSupabaseAdmin();
    const { canManage } = await assertCanManageProject(admin, projectId, actor.id);
    if (!canManage) {
      return NextResponse.json(
        { error: 'No tienes permiso para ver invitaciones' },
        { status: 403 }
      );
    }

    const { data, error } = await admin
      .from('project_invitations')
      .select('*')
      .eq('project_id', projectId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ invitations: data || [] });
  } catch (error) {
    console.error('list project invitations failed:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}

export async function DELETE(req, { params }) {
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
    const { token } = body;
    if (!token) {
      return NextResponse.json({ error: 'token es requerido' }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    const { canManage } = await assertCanManageProject(admin, projectId, actor.id);
    if (!canManage) {
      return NextResponse.json(
        { error: 'No tienes permiso para revocar invitaciones' },
        { status: 403 }
      );
    }

    const { data: invite } = await admin
      .from('project_invitations')
      .select('*')
      .eq('token', token)
      .eq('project_id', projectId)
      .maybeSingle();

    if (!invite) {
      return NextResponse.json({ error: 'Invitación no encontrada' }, { status: 404 });
    }

    const { error } = await admin
      .from('project_invitations')
      .update({ status: 'revoked', updated_at: new Date().toISOString() })
      .eq('token', token);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, revoked: token });
  } catch (error) {
    console.error('revoke project invitation failed:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
