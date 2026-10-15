import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as changePassword } from '../src/pages/api/auth/change-password';
import { PATCH as userPatch } from '../src/pages/api/users/[id]';
import { verifySession, verifyPassword, hashPassword, createSession } from '../src/lib/auth';
import { sql } from '../src/lib/db';

vi.mock('../src/lib/auth', () => ({
  verifySession: vi.fn(),
  verifyPassword: vi.fn(),
  hashPassword: vi.fn(),
  createSession: vi.fn(),
}));

vi.mock('../src/lib/db', () => ({
  sql: vi.fn(),
}));

function createChangePasswordContext(sessionToken?: string, body: Record<string, unknown> = {}) {
  const cookieJar: Record<string, any> = {};
  return {
    request: new Request('http://localhost/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    cookies: {
      get: vi.fn(() => (sessionToken ? { value: sessionToken } : undefined)),
      set: vi.fn((name: string, val: any) => { cookieJar[name] = val; }),
    },
  } as any;
}

function createUserPatchContext(id: string, sessionToken?: string, body: Record<string, unknown> = {}) {
  return {
    params: { id },
    request: new Request(`http://localhost/api/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    cookies: {
      get: vi.fn(() => (sessionToken ? { value: sessionToken } : undefined)),
    },
  } as any;
}

describe('Password Management Endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/auth/change-password', () => {
    it('returns 401 when unauthorized', async () => {
      const res = await changePassword(createChangePasswordContext(undefined, {}));
      expect(res.status).toBe(401);
    });

    it('returns 403 for non-admin user attempting to change password', async () => {
      vi.mocked(verifySession).mockResolvedValue({ userId: 'u1', role: 'user' } as any);
      const res = await changePassword(createChangePasswordContext('valid-user', { currentPassword: 'old', newPassword: 'newPassword123' }));
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain('Only admin can change password');
    });

    it('returns 400 when new password is too short', async () => {
      vi.mocked(verifySession).mockResolvedValue({ userId: 'admin-1', role: 'admin' } as any);
      const res = await changePassword(createChangePasswordContext('valid', { currentPassword: 'old', newPassword: '12' }));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('at least 4 characters');
    });

    it('returns 400 when current password is wrong', async () => {
      vi.mocked(verifySession).mockResolvedValue({ userId: 'admin-1', role: 'admin' } as any);
      vi.mocked(sql).mockImplementation(async (strings: TemplateStringsArray, ...values: any[]) => {
        return { rows: [{ id: 'admin-1', password_hash: 'hashed_old', token_version: 1, role: 'admin' }] } as any;
      });
      vi.mocked(verifyPassword).mockResolvedValue(false);

      const res = await changePassword(createChangePasswordContext('valid', { currentPassword: 'wrong', newPassword: 'newPassword123' }));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('Current password is incorrect');
    });

    it('successfully changes admin password and updates session cookie', async () => {
      vi.mocked(verifySession).mockResolvedValue({ userId: 'admin-1', role: 'admin', sid: 'sess-1' } as any);
      vi.mocked(sql).mockImplementation(async (strings: TemplateStringsArray, ...values: any[]) => {
        return { rows: [{ id: 'admin-1', password_hash: 'hashed_old', token_version: 1, role: 'admin' }] } as any;
      });
      vi.mocked(verifyPassword).mockResolvedValue(true);
      vi.mocked(hashPassword).mockResolvedValue('hashed_new');
      vi.mocked(createSession).mockResolvedValue('new-session-jwt');

      const ctx = createChangePasswordContext('valid', { currentPassword: 'oldPassword', newPassword: 'newPassword123' });
      const res = await changePassword(ctx);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(ctx.cookies.set).toHaveBeenCalledWith('session', 'new-session-jwt', expect.any(Object));
    });
  });

  describe('PATCH /api/users/[id] (reset_password)', () => {
    it('returns 403 for non-admin', async () => {
      vi.mocked(verifySession).mockResolvedValue({ userId: 'u1', role: 'user' } as any);
      const res = await userPatch(createUserPatchContext('target-id', 'user-token', { action: 'reset_password', newPassword: 'abc' }));
      expect(res.status).toBe(403);
    });

    it('allows admin to reset a user password', async () => {
      vi.mocked(verifySession).mockResolvedValue({ userId: 'admin-id', role: 'admin' } as any);
      vi.mocked(hashPassword).mockResolvedValue('hashed_reset');
      vi.mocked(sql).mockResolvedValue({ rows: [] } as any);

      const res = await userPatch(createUserPatchContext('student-1', 'admin-token', { action: 'reset_password', newPassword: 'supersecret' }));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });
  });
});
