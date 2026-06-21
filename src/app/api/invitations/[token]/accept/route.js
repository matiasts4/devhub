import { NextResponse } from 'next/server';
import { getSupabaseAdmin, isCloudAuthEnabled } from '@/lib/invitations/supabaseAdmin';
import { getCurrentUser } from '@/lib/auth/apiAuth';

export const dynamic = 'force-dynamic';

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
    const { token } = await resolveParams(params);
    const actor = await getCurrentUser();
    if (!actor) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const admin = getSupabaseAdmin();

    const { data: workspaceInvite, error: wiError } = await admin
      .from('workspace_invitations')
      .select('*')
      .eq('token', token)
      .maybeSingle();

    if (wiError) {
      return NextResponse.json({ error: wiError.message }, { status: 500 });
    }

    if (workspaceInvite) {
      if (workspaceInvite.status === 'revoked') {
        return NextResponse.json({ error: 'Esta invitación fue revocada' }, { status: 410 });
      }
      if (workspaceInvite.status === 'accepted') {
        return NextResponse.json({
          success: true,
          workspaceId: workspaceInvite.workspace_id,
          alreadyAccepted: true,
        });
      }
      if (
        workspaceInvite.status !== 'pending' ||
        new Date(workspaceInvite.expires_at) < new Date()
      ) {
        return NextResponse.json({ error: 'Esta invitación expiró' }, { status: 410 });
      }

      const { error: memberError } = await admin.from('workspace_members').upsert(
        {
          workspace_id: workspaceInvite.workspace_id,
          user_id: actor.id,
          role: workspaceInvite.role,
          joined_at: new Date().toISOString(),
        },
        { onConflict: 'workspace_id,user_id' }
      );

      if (memberError) {
        return NextResponse.json({ error: memberError.message }, { status: 500 });
      }

      await admin
        .from('workspace_invitations')
        .update({ status: 'accepted', updated_at: new Date().toISOString() })
        .eq('token', token);

      return NextResponse.json({
        success: true,
        workspaceId: workspaceInvite.workspace_id,
      });
    }

    const { data: projectInvite, error: piError } = await admin
      .from('project_invitations')
      .select('*')
      .eq('token', token)
      .maybeSingle();

    if (piError) {
      return NextResponse.json({ error: piError.message }, { status: 500 });
    }

    if (!projectInvite) {
      return NextResponse.json({ error: 'Invitación no encontrada' }, { status: 404 });
    }

    if (projectInvite.status === 'revoked') {
      return NextResponse.json({ error: 'Esta invitación fue revocada' }, { status: 410 });
    }
    if (projectInvite.status === 'accepted') {
      return NextResponse.json({
        success: true,
        projectId: projectInvite.project_id,
        alreadyAccepted: true,
      });
    }
    if (projectInvite.status !== 'pending' || new Date(projectInvite.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Esta invitación expiró' }, { status: 410 });
    }

    const { error: pmError } = await admin.from('project_members').upsert(
      {
        project_id: projectInvite.project_id,
        user_id: actor.id,
        role: projectInvite.role,
        invited_at: new Date().toISOString(),
        accepted_at: new Date().toISOString(),
        invited_by: projectInvite.invited_by,
      },
      { onConflict: 'project_id,user_id' }
    );

    if (pmError) {
      return NextResponse.json({ error: pmError.message }, { status: 500 });
    }

    await admin
      .from('project_invitations')
      .update({ status: 'accepted', updated_at: new Date().toISOString() })
      .eq('token', token);

    return NextResponse.json({
      success: true,
      projectId: projectInvite.project_id,
    });
  } catch (error) {
    console.error('invitation accept route failed:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
