import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Returns the currently authenticated Supabase user in API routes.
 * Returns null if not authenticated or not in cloud mode.
 */
export async function getCurrentUser() {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          },
        },
      }
    );
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
