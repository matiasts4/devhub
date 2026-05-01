import { NextResponse } from 'next/server';

// Local-first: invite system not needed (single user)
// Return success mock for compatibility
export async function POST(req, { params }) {
  try {
    const { id } = params;
    const { email, role } = await req.json();

    if (!email || !role) {
      return NextResponse.json({ error: 'Email y rol son requeridos' }, { status: 400 });
    }

    // In local mode, invites are not used
    const inviteUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'http://127.0.0.1:3400'}/project/${id}`;

    return NextResponse.json({
      success: true,
      message: 'Invitación creada (local mode)',
      inviteUrl,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
