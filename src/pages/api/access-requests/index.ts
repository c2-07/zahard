import type { APIRoute } from 'astro';
import { sql, initSchema, seedAdmin } from '../../../lib/db';
import { verifySession } from '../../../lib/auth';
import { randomUUID } from 'node:crypto';

export const POST: APIRoute = async ({ request }) => {
  try {
    await initSchema();
    await seedAdmin();
    
    const { username } = await request.json();
    if (!username) {
      return new Response(JSON.stringify({ error: 'Username/Email is required' }), { status: 400 });
    }

    // Check if user already exists in users table
    const { rows: userRows } = await sql`SELECT * FROM users WHERE username = ${username}`;
    const existingUser = userRows[0];

    if (existingUser) {
      if (existingUser.role !== 'admin' && existingUser.expires_at) {
        const expiresAt = new Date(existingUser.expires_at).getTime();
        if (Date.now() > expiresAt) {
          // User is expired. Delete them so they can re-request.
          await sql`DELETE FROM users WHERE id = ${existingUser.id}`;
        } else {
          return new Response(JSON.stringify({ state: 'active', message: 'You already have an active account. Please login.' }), { status: 200 });
        }
      } else {
        return new Response(JSON.stringify({ state: 'active', message: 'You already have an active account. Please login.' }), { status: 200 });
      }
    }

    // Check access_requests table
    const { rows: existReqRows } = await sql`SELECT * FROM access_requests WHERE username = ${username}`;
    const existingReq = existReqRows[0];

    if (existingReq) {
      if (existingReq.status === 'approved') {
        return new Response(JSON.stringify({ state: 'approved', message: 'Your request is approved! Please set your password.' }), { status: 200 });
      } else {
        return new Response(JSON.stringify({ state: 'pending', message: 'Your request is still pending admin approval.' }), { status: 200 });
      }
    }

    // Insert new request
    await sql`INSERT INTO access_requests (id, username, status) VALUES (${randomUUID()}, ${username}, 'pending')`;

    return new Response(JSON.stringify({ state: 'created', message: 'Request submitted successfully. Waiting for admin approval.' }), { status: 201 });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500 });
  }
};

export const GET: APIRoute = async ({ request, cookies }) => {
  const cookie = cookies.get('session');
  if (!cookie) return new Response('Unauthorized', { status: 401 });

  const session = await verifySession(cookie.value);
  if (!session || session.role !== 'admin') {
    return new Response('Forbidden', { status: 403 });
  }

  const { rows: requests } = await sql`SELECT * FROM access_requests ORDER BY requested_at DESC`;

  return new Response(JSON.stringify(requests), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
