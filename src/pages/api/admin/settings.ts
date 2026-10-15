import type { APIRoute } from 'astro';
import { setSetting } from '../../../lib/db';
import { verifySession } from '../../../lib/auth';

export const POST: APIRoute = async ({ request, cookies }) => {
  const cookie = cookies.get('session');
  if (!cookie) return new Response('Unauthorized', { status: 401 });

  const session = await verifySession(cookie.value);
  if (!session) return new Response('Unauthorized', { status: 401 });
  if (session.role !== 'admin') return new Response('Forbidden', { status: 403 });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON request' }), { 
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const { api_enabled, default_expiration_days } = body;

  if (api_enabled !== undefined) await setSetting('api_enabled', api_enabled.toString());
  if (default_expiration_days !== undefined) await setSetting('default_expiration_days', default_expiration_days.toString());

  return new Response(JSON.stringify({ success: true }), { 
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};
