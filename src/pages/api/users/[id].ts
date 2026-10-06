import type { APIRoute } from 'astro';
import { db } from '../../../lib/db';
import { verifySession } from '../../../lib/auth';

export const PATCH: APIRoute = async ({ params, request, cookies }) => {
  const cookie = cookies.get('session');
  if (!cookie) return new Response('Unauthorized', { status: 401 });

  const session = await verifySession(cookie.value);
  if (!session || session.role !== 'admin') {
    return new Response('Forbidden', { status: 403 });
  }

  const userId = params.id;
  const { action, days } = await request.json();

  if (action === 'extend' && days) {
    const userStmt = db.prepare('SELECT expires_at FROM users WHERE id = ?');
    const user = userStmt.get(userId) as any;

    if (!user) return new Response('Not found', { status: 404 });

    const currentExp = user.expires_at ? new Date(user.expires_at) : new Date();
    // if already expired, start from now
    const baseDate = currentExp < new Date() ? new Date() : currentExp;
    baseDate.setDate(baseDate.getDate() + parseInt(days));

    const updateStmt = db.prepare('UPDATE users SET expires_at = ? WHERE id = ?');
    updateStmt.run(baseDate.toISOString(), userId);

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  }

  return new Response('Invalid action', { status: 400 });
};

export const DELETE: APIRoute = async ({ params, cookies }) => {
  const cookie = cookies.get('session');
  if (!cookie) return new Response('Unauthorized', { status: 401 });

  const session = await verifySession(cookie.value);
  if (!session || session.role !== 'admin') {
    return new Response('Forbidden', { status: 403 });
  }

  const userId = params.id;
  
  const userStmt = db.prepare('SELECT role FROM users WHERE id = ?');
  const user = userStmt.get(userId) as any;
  if (!user) return new Response('Not found', { status: 404 });
  if (user.role === 'admin') return new Response('Cannot delete admin', { status: 400 });

  const delStmt = db.prepare('DELETE FROM users WHERE id = ?');
  delStmt.run(userId);

  return new Response(JSON.stringify({ success: true }), { status: 200 });
};
