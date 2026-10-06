import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

const DB_DIR = path.resolve('.data');
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

export const db = new Database(path.join(DB_DIR, 'app.db'));
db.pragma('journal_mode = WAL');

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME
  );

  CREATE TABLE IF NOT EXISTS access_requests (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    requested_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// Seed default settings
const initSettings = db.transaction(() => {
  const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  insertSetting.run('api_enabled', 'true');
  insertSetting.run('default_expiration_days', '1');
});
initSettings();

export async function seedAdmin() {
  const adminUsername = process.env.ADMIN_USERNAME;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (adminUsername && adminPassword) {
    const stmt = db.prepare('SELECT id FROM users WHERE username = ?');
    if (!stmt.get(adminUsername)) {
      const bcrypt = await import('bcryptjs');
      const hash = await bcrypt.default.hash(adminPassword, 10);
      const { randomUUID } = await import('node:crypto');
      const insert = db.prepare('INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)');
      insert.run(randomUUID(), adminUsername, hash, 'admin');
      console.log(`Admin user ${adminUsername} seeded.`);
    }
  }
}
// Automatically seed admin when db is loaded (note: this is async but should finish quickly)
seedAdmin().catch(console.error);

export function getSetting(key: string): string | null {
  const stmt = db.prepare('SELECT value FROM settings WHERE key = ?');
  const result = stmt.get(key) as { value: string } | undefined;
  return result ? result.value : null;
}

export function setSetting(key: string, value: string) {
  const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  stmt.run(key, value);
}

// Clean up expired users function
export function cleanupExpiredUsers() {
  const stmt = db.prepare('DELETE FROM users WHERE role = ? AND expires_at IS NOT NULL AND expires_at < CURRENT_TIMESTAMP');
  stmt.run('user');
}
