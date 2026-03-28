import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import crypto from 'crypto'

export async function POST(req, { params }) {
  try {
    const { id } = params // project_id
    const { email, role } = await req.json()
    
    if (!email || !role) {
      return new Response(JSON.stringify({ error: "Email y rol son requeridos" }), { status: 400 })
    }

    const cookieStore = cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          get(name) {
            return cookieStore.get(name)?.value
          },
        },
      }
    )

    const { data: userData, error: authError } = await supabase.auth.getUser()
    if (authError || !userData?.user) {
      return new Response(JSON.stringify({ error: "No autorizado" }), { status: 401 })
    }

    // Verificar si el usuario que invita es admin del proyecto
    const { data: member, error: memberError } = await supabase
      .from('project_members')
      .select('role')
      .eq('project_id', id)
      .eq('user_id', userData.user.id)
      .single()

    if (memberError || member?.role !== 'admin') {
      return new Response(JSON.stringify({ error: "No tienes permisos de administrador" }), { status: 403 })
    }

    // Crear token único
    const token = crypto.randomUUID()

    // Insertar en project_members
    const { error: insertError } = await supabase
      .from('project_members')
      .insert({
        project_id: id,
        role: role,
        invited_email: email,
        invite_token: token,
        invited_by: userData.user.id
      })

    if (insertError) {
      console.error(insertError)
      return new Response(JSON.stringify({ error: "Error al crear la invitación" }), { status: 500 })
    }

    // Aquí idealmente usamos Resend/SendGrid. Por ahora devolvemos el token.
    const inviteUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/invite/${token}`
    
    return new Response(JSON.stringify({ 
      success: true, 
      message: "Invitación creada",
      inviteUrl
    }), { status: 200 })

  } catch (error) {
    console.error(error)
    return new Response(JSON.stringify({ error: "Error interno del servidor" }), { status: 500 })
  }
}
