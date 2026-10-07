import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../src/pages/api/admin/settings';
import { verifySession } from '../src/lib/auth';
import { setSetting } from '../src/lib/db';

vi.mock('../src/lib/auth', () => ({
  verifySession: vi.fn(),
}));

vi.mock('../src/lib/db', () => ({
  setSetting: vi.fn(),
}));

function createContext(sessionToken?: string, body: Record<string, unknown> = {}) {
  return {
    request: new Request('http://localhost/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    cookies: {
      get: vi.fn(() => (sessionToken ? { value: sessionToken } : undefined)),
    },
  } as any;
}

describe('Admin auth flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when session cookie is missing', async () => {
    const response = await POST(createContext(undefined));
    expect(response.status).toBe(401);
  });

  it('returns 401 when session token is invalid', async () => {
    vi.mocked(verifySession).mockResolvedValue(null);

    const response = await POST(createContext('invalid-token'));
    expect(response.status).toBe(401);
  });

  it('returns 403 for non-admin users', async () => {
    vi.mocked(verifySession).mockResolvedValue({ userId: 'u-1', role: 'user' } as any);

    const response = await POST(createContext('user-token'));
    expect(response.status).toBe(403);
  });

  it('allows admin users and applies settings updates', async () => {
    vi.mocked(verifySession).mockResolvedValue({ userId: 'a-1', role: 'admin' } as any);

    const response = await POST(
      createContext('admin-token', {
        api_enabled: 'true',
        default_expiration_days: 30,
      }),
    );

    expect(response.status).toBe(200);
    expect(setSetting).toHaveBeenCalledWith('api_enabled', 'true');
    expect(setSetting).toHaveBeenCalledWith('default_expiration_days', '30');
  });
});
