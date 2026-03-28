import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET(req, { params }) {
  const { token } = params
  
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
    // Redirigir al login y luego que acepten? o simplemente mandar al login
    return NextResponse.redirect(new URL('/login?next=/invite/' + token, req.url))
  }

  // Buscar el token
  const { data: invite, error: inviteError } = await supabase
    .from('project_members')
    .select('*')
    .eq('invite_token', token)
    .single()

  if (inviteError || !invite) {
    return NextResponse.redirect(new URL('/dashboard?error=invalid_token', req.url))
  }

  // Verificar que corresponda el mail, o simplemente aceptar y sobreescribir el ID de usuario
  // Actualizar membresía
  const { error: updateError } = await supabase
    .from('project_members')
    .update({
      user_id: userData.user.id, // el usuario actual
      accepted_at: new Date().toISOString(),
      invite_token: null // Invalidar el token
    })
    .eq('id', invite.id)

  if (updateError) {
    return NextResponse.redirect(new URL('/dashboard?error=update_failed', req.url))
  }

  // Redirigir al proyecto
  return NextResponse.redirect(new URL('/project/' + invite.project_id, req.url))
}
