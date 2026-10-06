import type { APIRoute } from 'astro';
import { db } from '../../../lib/db';
import { verifyPassword, createSession } from '../../../lib/auth';

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return new Response(JSON.stringify({ error: 'Missing credentials' }), { status: 400 });
    }

    const stmt = db.prepare('SELECT * FROM users WHERE username = ?');
    const user = stmt.get(username) as any;

    if (!user) {
      return new Response(JSON.stringify({ error: 'Invalid credentials' }), { status: 401 });
    }

    // Check expiration
    if (user.role !== 'admin' && user.expires_at) {
      const expiresAt = new Date(user.expires_at).getTime();
      if (Date.now() > expiresAt) {
        // Delete user
        const delStmt = db.prepare('DELETE FROM users WHERE id = ?');
        delStmt.run(user.id);
        return new Response(JSON.stringify({ error: 'Account expired' }), { status: 401 });
      }
    }

    const isValid = await verifyPassword(password, user.password_hash);
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

  } catch (err) {
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500 });
  }
};
