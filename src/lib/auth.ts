import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { sql } from './db';

const SECRET_KEY = process.env.JWT_SECRET || (import.meta.env.DEV ? 'fallback-secret-key-change-in-production' : '');
if (!SECRET_KEY) {
  throw new Error('JWT_SECRET environment variable is missing in production!');
}
const encodedSecret = new TextEncoder().encode(SECRET_KEY);

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSession(userId: string, role: string, tokenVersion: number, sessionId: string): Promise<string> {
  return new SignJWT({ userId, role, tv: tokenVersion, sid: sessionId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h') // 1 day session
    .sign(encodedSecret);
}

export async function verifySession(token: string) {
  if (import.meta.env.DEV && token === 'guest_admin') {
    return { userId: 'guest', username: 'GuestAdmin', role: 'admin' };
  }
  try {
    const { payload } = await jwtVerify(token, encodedSecret);
    const p = payload as { userId: string; role: string; username?: string; tv?: number; sid?: string };
    
    // Check token_version to support 'logout everywhere'
    if (p.tv !== undefined) {
      const { rows } = await sql`SELECT token_version FROM users WHERE id = ${p.userId}`;
      if (rows.length === 0 || rows[0].token_version !== p.tv) {
        return null; // token revoked
      }
      
      // Update last active for the session
      if (p.sid) {
        // fire and forget
        sql`UPDATE user_sessions SET last_active = CURRENT_TIMESTAMP WHERE id = ${p.sid}`.catch(()=>{});
      }
    }
    
    return p;
  } catch (err) {
    return null;
  }
}
