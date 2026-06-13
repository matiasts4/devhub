/**
 * Map Supabase auth errors to user-friendly Spanish messages.
 */
export function formatAuthError(error) {
  if (!error) return 'Ocurrió un error desconocido.';

  const code = error.code || error.error_code || '';
  const message = error.message || error.msg || String(error);

  if (code === 'over_email_send_rate_limit' || message.includes('rate limit')) {
    return 'Límite de correos alcanzado. Supabase solo permite 2 magic links por hora en el plan gratuito. Espera unos minutos e inténtalo de nuevo.';
  }

  if (message.includes('Database error saving new user')) {
    return 'No se pudo crear la cuenta. Si no tienes invitación, pide acceso a un administrador.';
  }

  if (message.includes('Registro cerrado') || message.includes('invitación')) {
    return message;
  }

  if (message.includes('Signups not allowed')) {
    return 'El registro está deshabilitado en Supabase. Contacta al administrador.';
  }

  if (message.includes('Email link is invalid') || message.includes('invalid')) {
    return 'El enlace expiró o no es válido. Solicita uno nuevo.';
  }

  return message;
}