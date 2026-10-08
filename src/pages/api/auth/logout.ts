import type { APIRoute } from 'astro';
import { verifySession } from '../../../lib/auth';
import { sql } from '../../../lib/db';

export const POST: APIRoute = async ({ cookies }) => {
  const cookie = cookies.get('session');
  if (cookie) {
    const session = await verifySession(cookie.value);
    if (session?.sid) {
      await sql`DELETE FROM user_sessions WHERE id = ${session.sid}`;
    }
  }
  cookies.delete('session', { path: '/' });
  return new Response(JSON.stringify({ success: true }), { status: 200 });
};
