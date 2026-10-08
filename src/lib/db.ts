import { sql } from '@vercel/postgres';

export async function initSchema() {
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(255) PRIMARY KEY,
      username VARCHAR(255) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role VARCHAR(50) NOT NULL DEFAULT 'user',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      expires_at TIMESTAMP
    );
  `;

  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INT DEFAULT 1;`.catch(()=>console.log('token_version exists'));
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS api_calls INT DEFAULT 0;`.catch(()=>console.log('api_calls exists'));

  await sql`
    CREATE TABLE IF NOT EXISTS user_sessions (
      id VARCHAR(255) PRIMARY KEY,
      user_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,
      ip VARCHAR(255),
      location VARCHAR(255),
      device TEXT,
      last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS access_requests (
      id VARCHAR(255) PRIMARY KEY,
      username VARCHAR(255) UNIQUE NOT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'pending',
      requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;
  await sql`ALTER TABLE access_requests ADD COLUMN IF NOT EXISTS password_hash TEXT;`.catch(()=>console.log('password_hash exists'));

  await sql`
    CREATE TABLE IF NOT EXISTS settings (
      key VARCHAR(255) PRIMARY KEY,
      value TEXT NOT NULL
    );
  `;

  await sql`
    INSERT INTO settings (key, value) VALUES ('api_enabled', 'true')
    ON CONFLICT (key) DO NOTHING;
  `;
  await sql`
    INSERT INTO settings (key, value) VALUES ('default_expiration_days', '1')
    ON CONFLICT (key) DO NOTHING;
  `;
}

export async function seedAdmin() {
  const adminUsername = process.env.ADMIN_USERNAME;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (adminUsername && adminPassword) {
    const { rows } = await sql`SELECT id FROM users WHERE username = ${adminUsername}`;
    if (rows.length === 0) {
      const bcrypt = await import('bcryptjs');
      const hash = await bcrypt.default.hash(adminPassword, 10);
      const { randomUUID } = await import('node:crypto');
      await sql`
        INSERT INTO users (id, username, password_hash, role) 
        VALUES (${randomUUID()}, ${adminUsername}, ${hash}, 'admin')
      `;
      console.log(`Admin user ${adminUsername} seeded.`);
    }
  }
}

// In serverless, these are better run as a migration step, 
// but we leave them here for parity with the old sqlite logic.
// They will fail if POSTGRES_URL is not provided.
if (process.env.POSTGRES_URL) {
  initSchema().then(seedAdmin).catch(console.error);
}

export async function getSetting(key: string): Promise<string | null> {
  const { rows } = await sql`SELECT value FROM settings WHERE key = ${key}`;
  return rows.length > 0 ? rows[0].value : null;
}

export async function setSetting(key: string, value: string) {
  await sql`
    INSERT INTO settings (key, value) VALUES (${key}, ${value})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `;
}

export async function cleanupExpiredUsers() {
  await sql`
    DELETE FROM users WHERE role = 'user' AND expires_at IS NOT NULL AND expires_at < CURRENT_TIMESTAMP
  `;
}

// Export sql for direct queries
export { sql };
