import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';

const SECRET_KEY = process.env.JWT_SECRET || 'fallback-secret-key-change-in-production';
const encodedSecret = new TextEncoder().encode(SECRET_KEY);

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSession(userId: string, role: string): Promise<string> {
  return new SignJWT({ userId, role })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h') // 1 day session
    .sign(encodedSecret);
}

export async function verifySession(token: string) {
  try {
    const { payload } = await jwtVerify(token, encodedSecret);
    return payload as { userId: string; role: string };
  } catch (err) {
    return null;
  }
}
