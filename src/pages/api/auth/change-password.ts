import type { APIRoute } from 'astro';
import { sql } from '../../../lib/db';
import { verifySession, verifyPassword, hashPassword, createSession } from '../../../lib/auth';

export const POST: APIRoute = async ({ request, cookies }) => {
  const cookie = cookies.get('session');
  if (!cookie) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const session = await verifySession(cookie.value);
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  if (session.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Forbidden: Only admin can change password' }), { status: 403 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON request' }), { status: 400 });
  }

  const { currentPassword, newPassword } = body;

  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 4) {
    return new Response(JSON.stringify({ error: 'New password must be at least 4 characters long' }), { status: 400 });
  }

  // Handle dev/guest admin mode
  if (session.userId === 'guest') {
    return new Response(JSON.stringify({ success: true, message: 'Password updated (Dev guest mode)' }), { status: 200 });
  }

  if (!currentPassword) {
    return new Response(JSON.stringify({ error: 'Current password is required' }), { status: 400 });
  }

  const { rows } = await sql`SELECT * FROM users WHERE id = ${session.userId}`;
  const user = rows[0];
  if (!user) {
    return new Response(JSON.stringify({ error: 'User not found' }), { status: 404 });
  }

  const isValid = await verifyPassword(currentPassword, user.password_hash);
  if (!isValid) {
    return new Response(JSON.stringify({ error: 'Current password is incorrect' }), { status: 400 });
  }

  const hashed = await hashPassword(newPassword);
  const newTokenVersion = (user.token_version || 1) + 1;

  await sql`UPDATE users SET password_hash = ${hashed}, token_version = ${newTokenVersion} WHERE id = ${session.userId}`;

  // Issue updated session with new token_version so current session stays active
  const updatedSessionToken = await createSession(user.id, user.role, newTokenVersion, (session as any).sid || user.id);
  cookies.set('session', updatedSessionToken, {
    path: '/',
    httpOnly: true,
    secure: import.meta.env.PROD,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24
  });

  return new Response(JSON.stringify({ success: true, message: 'Password successfully changed' }), { status: 200 });
};
