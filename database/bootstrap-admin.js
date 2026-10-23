import { hash } from 'bcryptjs';
import { Client } from 'pg';

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} must be configured in .env.local or .env.`);
  }
  return value;
}

function validatePassword(password) {
  if (
    password.length < 6 ||
    Buffer.byteLength(password, 'utf8') > 72 ||
    !/[A-Z]/.test(password) ||
    !/[a-z]/.test(password) ||
    !/[0-9]/.test(password) ||
    !/[^A-Za-z0-9]/.test(password)
  ) {
    throw new Error(
      'GLOWNSCAN_ADMIN_PASSWORD must contain at least 6 characters, uppercase, lowercase, a number, and a special character.',
    );
  }
}

async function main() {
  const connectionString =
    process.env.GLOWNSCAN_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('GLOWNSCAN_DATABASE_URL is required.');
  }
  const email = requiredEnvironment('GLOWNSCAN_ADMIN_EMAIL')
    .trim()
    .toLowerCase();
  if (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('GLOWNSCAN_ADMIN_EMAIL must be a valid email address.');
  }
  const password = requiredEnvironment('GLOWNSCAN_ADMIN_PASSWORD');
  validatePassword(password);

  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query('BEGIN');
    const roles = await client.query(
      `SELECT id FROM app_auth.roles WHERE code = 'ADMIN'`,
    );
    if (!roles.rowCount) {
      throw new Error('ADMIN role is missing. Run database migrations first.');
    }

    const existing = await client.query(
      `SELECT id FROM app_auth.users WHERE email = $1 AND deleted_at IS NULL`,
      [email],
    );
    if (existing.rowCount) {
      throw new Error(`An active account already exists for ${email}.`);
    }

    const user = await client.query(
      `INSERT INTO app_auth.users
         (email, password_hash, status, email_verified_at)
       VALUES ($1, $2, 'ACTIVE', CURRENT_TIMESTAMP)
       RETURNING id`,
      [email, await hash(password, 12)],
    );
    await client.query(
      `INSERT INTO app_auth.user_roles (user_id, role_id)
       VALUES ($1, $2)`,
      [user.rows[0].id, roles.rows[0].id],
    );
    await client.query('COMMIT');
    console.log(`Created admin account ${email}.`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('Admin bootstrap failed:', error);
  process.exitCode = 1;
});
