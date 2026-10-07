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
    await sql`UPDATE access_requests SET status = 'approved' WHERE id = ${reqId}`;
    return new Response(JSON.stringify({ success: true }), { status: 200 });

  } else if (action === 'reject') {
    await sql`DELETE FROM access_requests WHERE id = ${reqId}`;
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  }

  return new Response(JSON.stringify({ error: 'Invalid action' }), { status: 400 });
};
