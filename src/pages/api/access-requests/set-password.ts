import type { APIRoute } from 'astro';
import { sql, getSetting } from '../../../lib/db';
import { hashPassword } from '../../../lib/auth';
import { randomUUID } from 'node:crypto';

export const POST: APIRoute = async ({ request }) => {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return new Response(JSON.stringify({ error: 'Username and password are required' }), { status: 400 });
    }

    const { rows } = await sql`SELECT * FROM access_requests WHERE username = ${username} AND status = 'approved'`;
    const accessReq = rows[0];

    if (!accessReq) {
      return new Response(JSON.stringify({ error: 'No approved request found for this username.' }), { status: 404 });
    }

    const hashed = await hashPassword(password);
    const defaultExp = parseInt(await getSetting('default_expiration_days') || '1');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + defaultExp);

    await sql`INSERT INTO users (id, username, password_hash, role, expires_at) VALUES (${randomUUID()}, ${username}, ${hashed}, 'user', ${expiresAt.toISOString()})`;
    await sql`DELETE FROM access_requests WHERE id = ${accessReq.id}`;

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500 });
  }
};
