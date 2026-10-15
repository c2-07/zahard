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
  let action: string | undefined;
  try {
    const body = await request.json();
    action = body.action;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON request' }), { 
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (action === 'approve') {
    const { rows } = await sql`SELECT * FROM access_requests WHERE id = ${reqId}`;
    const reqRow = rows[0];
    if (!reqRow) return new Response(JSON.stringify({ error: 'Not found' }), { 
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });

    const { getSetting } = await import('../../../lib/db');
    const { randomUUID } = await import('node:crypto');
    
    const defaultExp = parseInt(await getSetting('default_expiration_days') || '1');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + defaultExp);

    await sql`
      INSERT INTO users (id, username, password_hash, role, expires_at, token_version) 
      VALUES (${randomUUID()}, ${reqRow.username}, ${reqRow.password_hash || ''}, 'user', ${expiresAt.toISOString()}, 1)
    `;
    await sql`DELETE FROM access_requests WHERE id = ${reqId}`;

    return new Response(JSON.stringify({ success: true }), { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } else if (action === 'reject') {
    await sql`DELETE FROM access_requests WHERE id = ${reqId}`;
    return new Response(JSON.stringify({ success: true }), { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify({ error: 'Invalid action' }), { 
    status: 400,
    headers: { 'Content-Type': 'application/json' }
  });
};
