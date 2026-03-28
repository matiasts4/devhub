// Stub route for static export compatibility.
// In Tauri, OAuth callbacks are handled client-side via AuthCallback page.
// This route is only functional in development (Next.js server) mode.
export const dynamic = 'force-static';

export async function GET() {
  return new Response('Auth handled client-side in Tauri', { status: 200 });
}
