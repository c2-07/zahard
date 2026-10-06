import { describe, it, expect } from 'vitest';
import { createSession, verifySession } from '../src/lib/auth';

describe('Auth Service', () => {
  it('should create a valid session token', async () => {
    const userId = '12345';
    const token = await createSession(userId, 'user');
    expect(token).toBeDefined();
    expect(typeof token).toBe('string');
  });

  it('should verify a valid session token', async () => {
    const userId = 'admin-user';
    const role = 'admin';
    const token = await createSession(userId, role);
    const verified = await verifySession(token);
    
    expect(verified).not.toBeNull();
    expect(verified?.userId).toBe(userId);
    expect(verified?.role).toBe(role);
  });

  it('should fail on invalid token', async () => {
    const verified = await verifySession('invalid.token.here');
    expect(verified).toBeNull();
  });
});
