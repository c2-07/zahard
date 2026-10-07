import type { APIRoute } from 'astro';
import { sql, initSchema, seedAdmin } from '../../../lib/db';
import { verifyPassword, createSession } from '../../../lib/auth';

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    // Ensure tables exist on Vercel Serverless since background tasks often get killed
    await initSchema();
    await seedAdmin();

    const { username, password, pzaword } = await request.json();
    const submittedPassword = password ?? pzaword;

    if (!username || !submittedPassword) {
      return new Response(JSON.stringify({ error: 'Missing credentials' }), { status: 400 });
    }

    const { rows } = await sql`SELECT * FROM users WHERE username = ${username}`;
    const user = rows[0];

    if (!user) {
      return new Response(JSON.stringify({ error: 'Invalid credentials' }), { status: 401 });
    }

    // Check expiration
    if (user.role !== 'admin' && user.expires_at) {
      const expiresAt = new Date(user.expires_at).getTime();
      if (Date.now() > expiresAt) {
        // Delete user
        await sql`DELETE FROM users WHERE id = ${user.id}`;
        return new Response(JSON.stringify({ error: 'Account expired' }), { status: 401 });
      }
    }

    const isValid = await verifyPassword(submittedPassword, user.password_hash);
    if (!isValid) {
      return new Response(JSON.stringify({ error: 'Invalid credentials' }), { status: 401 });
    }

    const token = await createSession(user.id, user.role);
    
    cookies.set('session', token, {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 // 1 day
    });

    return new Response(JSON.stringify({ success: true, role: user.role }), { status: 200 });

  } catch (err: any) {
    console.error('Login error:', err);
    return new Response(JSON.stringify({ error: 'Server error', details: err.message }), { status: 500 });
  }
};
