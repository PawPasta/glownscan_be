import { hash } from 'bcryptjs';

export const DEVELOPMENT_ADMIN_EMAIL = 'service.noreply2004@gmail.com';
export const DEVELOPMENT_ADMIN_PASSWORD = 'Admin@123';

export async function seedDevelopmentAdmin(
  client,
  nodeEnv = process.env.NODE_ENV,
) {
  if (nodeEnv === 'production') return false;

  await client.query('BEGIN');
  try {
    const role = await client.query(
      `SELECT id FROM app_auth.roles WHERE code = 'ADMIN'`,
    );
    if (!role.rows[0]) {
      throw new Error('ADMIN role is missing. Run migrations first.');
    }

    const existing = await client.query(
      `SELECT id FROM app_auth.users WHERE email = $1 AND deleted_at IS NULL`,
      [DEVELOPMENT_ADMIN_EMAIL],
    );
    if (existing.rows[0]) {
      await client.query('COMMIT');
      return false;
    }

    const user = await client.query(
      `INSERT INTO app_auth.users
         (email, password_hash, status, email_verified_at)
       VALUES ($1, $2, 'ACTIVE', CURRENT_TIMESTAMP)
       RETURNING id`,
      [DEVELOPMENT_ADMIN_EMAIL, await hash(DEVELOPMENT_ADMIN_PASSWORD, 12)],
    );
    await client.query(
      `INSERT INTO app_auth.user_roles (user_id, role_id)
       VALUES ($1, $2)`,
      [user.rows[0].id, role.rows[0].id],
    );
    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
