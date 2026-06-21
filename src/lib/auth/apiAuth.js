import { createRouteHandlerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Returns the currently authenticated Supabase user in API routes.
 * Returns null if not authenticated or not in cloud mode.
 */
export async function getCurrentUser() {
  try {
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user) return null;
    return {
      id: data.user.id,
      email: data.user.email,
    };
  } catch (error) {
    console.error('getCurrentUser failed:', error);
    return null;
  }
}
