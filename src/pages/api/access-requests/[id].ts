import type { APIRoute } from 'astro';
import { sql } from '../../../lib/db';
import { verifySession } from '../../../lib/auth';

export const POST: APIRoute = async ({ params, request, cookies }) => {
  const cookie = cookies.get('session');
  if (!cookie) return new Response('Unauthorized', { status: 401 });

  const session = await verifySession(cookie.value);
  if (!session) return new Response('Unauthorized', { status: 401 });
  if (session.role !== 'admin') return new Response('Forbidden', { status: 403 });

  const reqId = params.id;
  const { action } = await request.json();

  if (action === 'approve') {
    const { rows } = await sql`SELECT * FROM access_requests WHERE id = ${reqId}`;
    const reqRow = rows[0];
    if (!reqRow) return new Response('Not found', { status: 404 });

    const { getSetting } = await import('../../../lib/db');
    const { randomUUID } = await import('node:crypto');
    
    const defaultExp = parseInt(await getSetting('default_expiration_days') || '1');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + defaultExp);

    await sql`
      INSERT INTO users (id, username, password_hash, role, expires_at) 
      VALUES (${randomUUID()}, ${reqRow.username}, ${reqRow.password_hash || ''}, 'user', ${expiresAt.toISOString()})
    `;
    await sql`DELETE FROM access_requests WHERE id = ${reqId}`;

    return new Response(JSON.stringify({ success: true }), { status: 200 });

  } else if (action === 'reject') {
    await sql`DELETE FROM access_requests WHERE id = ${reqId}`;
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  }

  return new Response(JSON.stringify({ error: 'Invalid action' }), { status: 400 });
};
