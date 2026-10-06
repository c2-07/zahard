import { describe, it, expect, vi } from 'vitest';
import { getSetting, setSetting } from '../src/lib/db';

// Mock the sql client
vi.mock('@vercel/postgres', () => {
  const store: Record<string, string> = {};
  return {
    sql: async (strings: TemplateStringsArray, ...values: any[]) => {
      const query = strings.join('?');
      if (query.includes('INSERT INTO settings')) {
        store[values[0]] = values[1];
        return { rows: [] };
      }
      if (query.includes('SELECT value FROM settings')) {
        const val = store[values[0]];
        return { rows: val !== undefined ? [{ value: val }] : [] };
      }
      return { rows: [] };
    }
  };
});

describe('Database Service', () => {
  it('should set and get settings correctly', async () => {
    await setSetting('test_key', 'test_value');
    const val = await getSetting('test_key');
    expect(val).toBe('test_value');
  });

  it('should return null for non-existent setting', async () => {
    const val = await getSetting('does_not_exist_xyz');
    expect(val).toBeNull();
  });
});
