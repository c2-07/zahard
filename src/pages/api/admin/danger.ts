import type { APIRoute } from 'astro';
import { sql } from '../../../lib/db';
import { verifySession } from '../../../lib/auth';

export const POST: APIRoute = async ({ request, cookies }) => {
  const cookie = cookies.get('session');
  if (!cookie) return new Response('Unauthorized', { status: 401 });

  const session = await verifySession(cookie.value);
  if (!session) return new Response('Unauthorized', { status: 401 });
  if (session.role !== 'admin') return new Response('Forbidden', { status: 403 });

  const body = await request.json();
  const { action } = body;

  if (session.userId === 'guest') {
    return new Response(JSON.stringify({ success: true, message: 'Action simulated in demo mode' }), { status: 200 });
  }

  if (action === 'logout_everyone') {
    // Increment token_version for all non-admin users so existing JWTs are invalidated
    await sql`UPDATE users SET token_version = COALESCE(token_version, 1) + 1 WHERE role != 'admin'`;
    // Remove all session records for non-admin users
    await sql`DELETE FROM user_sessions WHERE user_id IN (SELECT id FROM users WHERE role != 'admin')`;
    return new Response(JSON.stringify({ success: true, message: 'Logged out all users from all devices' }), { status: 200 });
  }

  if (action === 'delete_all_users') {
    // Delete session records first to respect constraints if any
    await sql`DELETE FROM user_sessions WHERE user_id IN (SELECT id FROM users WHERE role != 'admin')`;
    // Delete all non-admin users
    await sql`DELETE FROM users WHERE role != 'admin'`;
    return new Response(JSON.stringify({ success: true, message: 'Deleted all user accounts' }), { status: 200 });
  }

  return new Response('Invalid action', { status: 400 });
};
