import type { APIRoute } from 'astro';
import { sql } from '../../../lib/db';
import { verifySession } from '../../../lib/auth';

export const PATCH: APIRoute = async ({ params, request, cookies }) => {
  const cookie = cookies.get('session');
  if (!cookie) return new Response('Unauthorized', { status: 401 });

  const session = await verifySession(cookie.value);
  if (!session) return new Response('Unauthorized', { status: 401 });
  if (session.role !== 'admin') return new Response('Forbidden', { status: 403 });

  const userId = params.id;
  const body = await request.json();
  const { action } = body;

  if (action === 'extend') {
    const { rows } = await sql`SELECT expires_at FROM users WHERE id = ${userId}`;
    const user = rows[0];

    if (!user) return new Response('Not found', { status: 404 });

    const currentExp = user.expires_at ? new Date(user.expires_at) : new Date();
    // if already expired, start from now
    const baseDate = currentExp < new Date() ? new Date() : currentExp;
    
    const { hours, days, months, date } = body;

    if (date) {
      await sql`UPDATE users SET expires_at = ${new Date(date).toISOString()} WHERE id = ${userId}`;
    } else {
      if (hours) baseDate.setHours(baseDate.getHours() + parseInt(hours));
      if (days) baseDate.setDate(baseDate.getDate() + parseInt(days));
      if (months) baseDate.setMonth(baseDate.getMonth() + parseInt(months));
      await sql`UPDATE users SET expires_at = ${baseDate.toISOString()} WHERE id = ${userId}`;
    }

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  }

  if (action === 'logout_all') {
    await sql`UPDATE users SET token_version = token_version + 1 WHERE id = ${userId}`;
    await sql`DELETE FROM user_sessions WHERE user_id = ${userId}`;
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  }

  return new Response('Invalid action', { status: 400 });
};

export const DELETE: APIRoute = async ({ params, cookies }) => {
  const cookie = cookies.get('session');
  if (!cookie) return new Response('Unauthorized', { status: 401 });

  const session = await verifySession(cookie.value);
  if (!session) return new Response('Unauthorized', { status: 401 });
  if (session.role !== 'admin') return new Response('Forbidden', { status: 403 });

  const userId = params.id;
  
  const { rows } = await sql`SELECT role FROM users WHERE id = ${userId}`;
  const user = rows[0];
  if (!user) return new Response('Not found', { status: 404 });
  if (user.role === 'admin') return new Response('Cannot delete admin', { status: 400 });

  await sql`DELETE FROM users WHERE id = ${userId}`;

  return new Response(JSON.stringify({ success: true }), { status: 200 });
};
