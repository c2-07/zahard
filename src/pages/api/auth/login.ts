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

    const ip = request.headers.get('x-forwarded-for') || 'Unknown IP';
    const cityHeader = request.headers.get('x-vercel-ip-city') || 'Unknown';
    const countryHeader = request.headers.get('x-vercel-ip-country') || 'Unknown';
    
    const city = decodeURIComponent(cityHeader);
    const country = decodeURIComponent(countryHeader);
    const userAgent = request.headers.get('user-agent') || 'Unknown Device';

    const { randomUUID } = await import('node:crypto');
    const sessionId = randomUUID();
    const tokenVersion = user.token_version || 1;

    await sql`
      INSERT INTO user_sessions (id, user_id, ip, location, device)
      VALUES (${sessionId}, ${user.id}, ${ip}, ${`${city}, ${country}`}, ${userAgent})
    `;

    const token = await createSession(user.id, user.role, tokenVersion, sessionId);
    
    cookies.set('session', token, {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 // 1 day
    });

    if (user.role === 'admin') {
      const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
      if (webhookUrl) {
        const message = {
          embeds: [{
            title: "🚨 Admin Login Detected",
            color: 16711680, // Red
            fields: [
              { name: "Username", value: user.username, inline: true },
              { name: "IP Address", value: ip, inline: true },
              { name: "Location", value: `${city}, ${country}`, inline: true },
              { name: "Device", value: userAgent, inline: false },
            ],
            timestamp: new Date().toISOString()
          }]
        };

        try {
          await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(message)
          });
        } catch (err) {
          console.error("Failed to send webhook:", err);
        }
      }
    }

    return new Response(JSON.stringify({ success: true, role: user.role, username: user.username }), { status: 200 });

  } catch (err: any) {
    console.error('Login error:', err);
    return new Response(JSON.stringify({ error: 'Server error', details: err.message }), { status: 500 });
  }
};
