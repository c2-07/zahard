import { describe, it, expect, beforeAll } from 'vitest';
import { getSetting, setSetting } from '../src/lib/db';

describe('Database Service', () => {
  it('should set and get settings correctly', () => {
    setSetting('test_key', 'test_value');
    const val = getSetting('test_key');
    expect(val).toBe('test_value');
  });

  it('should return null for non-existent setting', () => {
    const val = getSetting('does_not_exist_xyz');
    expect(val).toBeNull();
  });
});
