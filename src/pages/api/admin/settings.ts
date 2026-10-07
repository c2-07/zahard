import type { APIRoute } from 'astro';
import { setSetting } from '../../../lib/db';
import { verifySession } from '../../../lib/auth';

export const POST: APIRoute = async ({ request, cookies }) => {
  const cookie = cookies.get('session');
  if (!cookie) return new Response('Unauthorized', { status: 401 });

  const session = await verifySession(cookie.value);
  if (!session) return new Response('Unauthorized', { status: 401 });
  if (session.role !== 'admin') return new Response('Forbidden', { status: 403 });

  const { api_enabled, default_expiration_days } = await request.json();

  if (api_enabled !== undefined) setSetting('api_enabled', api_enabled);
  if (default_expiration_days !== undefined) setSetting('default_expiration_days', default_expiration_days.toString());

  return new Response(JSON.stringify({ success: true }), { status: 200 });
};
