import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST as makeApi } from '../src/pages/api/make';
import { getSetting, sql } from '../src/lib/db';
import { verifySession } from '../src/lib/auth';

vi.mock('../src/lib/db', () => ({
  getSetting: vi.fn(),
  sql: vi.fn(),
}));

vi.mock('../src/lib/auth', () => ({
  verifySession: vi.fn(),
}));

function createContext(sessionToken: string | undefined, body: Record<string, unknown>) {
  return {
    request: new Request('http://localhost/api/make', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    cookies: {
      get: vi.fn(() => (sessionToken ? { value: sessionToken } : undefined)),
    },
  } as any;
}

describe('Make API Endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fails if API is disabled', async () => {
    vi.mocked(getSetting).mockResolvedValue('false');
    const response = await makeApi(createContext(undefined, {}));
    expect(response.status).toBe(503);
  });

  it('fails if not authenticated', async () => {
    vi.mocked(getSetting).mockResolvedValue('true');
    const response = await makeApi(createContext(undefined, {}));
    expect(response.status).toBe(401);
  });

  it('returns mocked response for testing prompt without hitting OpenAI/Gemini', async () => {
    vi.mocked(getSetting).mockResolvedValue('true');
    vi.mocked(verifySession).mockResolvedValue({ userId: 'test-user', role: 'admin' } as any);
    
    const response = await makeApi(createContext('valid-token', {
      prompt: '__TEST_PROMPT__',
      thinking: false
    }));
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.text).toBe('This is a mocked AI response for testing.');
    expect(data.provider).toBe('mock');
  });

  it('blocks user when daily limit of 100 is exceeded', async () => {
    vi.mocked(getSetting).mockResolvedValue('true');
    vi.mocked(verifySession).mockResolvedValue({ userId: 'student-1', role: 'user' } as any);
    const today = new Date().toISOString().slice(0, 10);
    vi.mocked(sql).mockImplementation(async (strings: TemplateStringsArray, ...values: any[]) => {
      const q = strings.join('');
      if (q.includes('SELECT expires_at')) {
        return { rows: [{ expires_at: null, daily_calls: 100, last_call_date: today }] } as any;
      }
      return { rows: [] } as any;
    });

    const response = await makeApi(createContext('valid-user-token', {
      prompt: '__TEST_PROMPT__',
      thinking: false
    }));

    expect(response.status).toBe(429);
    const data = await response.json();
    expect(data.error).toContain('Daily request limit reached');
  });

  it('allows user when daily calls are under 100', async () => {
    vi.mocked(getSetting).mockResolvedValue('true');
    vi.mocked(verifySession).mockResolvedValue({ userId: 'student-2', role: 'user' } as any);
    const today = new Date().toISOString().slice(0, 10);
    vi.mocked(sql).mockImplementation(async (strings: TemplateStringsArray, ...values: any[]) => {
      const q = strings.join('');
      if (q.includes('SELECT expires_at')) {
        return { rows: [{ expires_at: null, daily_calls: 42, last_call_date: today }] } as any;
      }
      return { rows: [] } as any;
    });

    const response = await makeApi(createContext('valid-user-token', {
      prompt: '__TEST_PROMPT__',
      thinking: false
    }));

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
  });
});
