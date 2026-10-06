import type { APIRoute } from 'astro';
import { db } from '../../../lib/db';
import { verifySession } from '../../../lib/auth';
import { randomUUID } from 'node:crypto';

export const POST: APIRoute = async ({ request }) => {
  try {
    const { username } = await request.json();
    if (!username) {
      return new Response(JSON.stringify({ error: 'Username/Email is required' }), { status: 400 });
    }

    // Check if user already exists in users table
    const userStmt = db.prepare('SELECT * FROM users WHERE username = ?');
    const existingUser = userStmt.get(username) as any;

    if (existingUser) {
      if (existingUser.role !== 'admin' && existingUser.expires_at) {
        const expiresAt = new Date(existingUser.expires_at).getTime();
        if (Date.now() > expiresAt) {
          // User is expired. Delete them so they can re-request.
          db.prepare('DELETE FROM users WHERE id = ?').run(existingUser.id);
        } else {
          return new Response(JSON.stringify({ state: 'active', message: 'You already have an active account. Please login.' }), { status: 200 });
        }
      } else {
        return new Response(JSON.stringify({ state: 'active', message: 'You already have an active account. Please login.' }), { status: 200 });
      }
    }

    // Check access_requests table
    const reqStmt = db.prepare('SELECT * FROM access_requests WHERE username = ?');
    const existingReq = reqStmt.get(username) as any;

    if (existingReq) {
      if (existingReq.status === 'approved') {
        return new Response(JSON.stringify({ state: 'approved', message: 'Your request is approved! Please set your password.' }), { status: 200 });
      } else {
        return new Response(JSON.stringify({ state: 'pending', message: 'Your request is still pending admin approval.' }), { status: 200 });
      }
    }

    // Insert new request
    const stmt = db.prepare('INSERT INTO access_requests (id, username, status) VALUES (?, ?, ?)');
    stmt.run(randomUUID(), username, 'pending');

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

  const stmt = db.prepare('SELECT * FROM access_requests ORDER BY requested_at DESC');
  const requests = stmt.all();

  return new Response(JSON.stringify(requests), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
