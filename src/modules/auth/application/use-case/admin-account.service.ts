import { Injectable } from '@nestjs/common';
import { hash } from 'bcryptjs';
import { DatabaseService } from '../../../../shared/database/database.service.js';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '../../../../shared/handler/http.exceptions.js';

@Injectable()
export class AdminAccountService {
  constructor(private readonly database: DatabaseService) {}

  async list(page: number, limit: number, search?: string) {
    const values: unknown[] = [];
    const conditions = ['u.deleted_at IS NULL'];
    if (search?.trim()) {
      values.push(`%${search.trim()}%`);
      conditions.push(
        `(u.email ILIKE $${values.length} OR u.full_name ILIKE $${values.length})`,
      );
    }
    values.push(limit, (page - 1) * limit);
    const result = await this.database.query(
      `SELECT u.id, u.email, u.full_name AS "fullName", u.status, u.email_verified_at AS "emailVerifiedAt", u.created_at AS "createdAt", COALESCE(array_agg(DISTINCT r.code) FILTER (WHERE r.code IS NOT NULL), '{}') AS roles, COUNT(*) OVER() AS total FROM app_auth.users u LEFT JOIN app_auth.user_roles ur ON ur.user_id = u.id LEFT JOIN app_auth.roles r ON r.id = ur.role_id WHERE ${conditions.join(' AND ')} GROUP BY u.id ORDER BY u.created_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    );
    return {
      items: result.rows.map(({ total: _total, ...row }) => row),
      page,
      limit,
      total: Number(result.rows[0]?.total ?? 0),
    };
  }

  async get(id: string) {
    const result = await this.database.query(
      `SELECT u.id, u.email, u.full_name AS "fullName", u.status, u.email_verified_at AS "emailVerifiedAt", u.created_at AS "createdAt", COALESCE(array_agg(DISTINCT r.code) FILTER (WHERE r.code IS NOT NULL), '{}') AS roles FROM app_auth.users u LEFT JOIN app_auth.user_roles ur ON ur.user_id = u.id LEFT JOIN app_auth.roles r ON r.id = ur.role_id WHERE u.id = $1 AND u.deleted_at IS NULL GROUP BY u.id`,
      [id],
    );
    if (!result.rows[0]) throw new NotFoundException('Account not found.');
    return result.rows[0];
  }

  async create(input: {
    email: string;
    password: string;
    fullName?: string;
    roleCodes?: string[];
  }) {
    const email = input.email.trim().toLowerCase();
    const roles = normalizedRoles(input.roleCodes);
    const id = await this.database.transaction(async (client) => {
      const exists = await client.query(
        'SELECT 1 FROM app_auth.users WHERE email = $1 AND deleted_at IS NULL',
        [email],
      );
      if (exists.rowCount)
        throw new ConflictException(
          'An account already exists for this email.',
        );
      const user = await client.query<{ id: string }>(
        `INSERT INTO app_auth.users (email, password_hash, full_name, status, email_verified_at) VALUES ($1, $2, $3, 'ACTIVE', CURRENT_TIMESTAMP) RETURNING id`,
        [email, await hash(input.password, 12), input.fullName?.trim() || null],
      );
      await this.replaceRoles(client, user.rows[0].id, roles);
      return user.rows[0].id;
    });
    return this.get(id);
  }

  async update(
    actorId: string,
    id: string,
    input: { fullName?: string; status?: string; roleCodes?: string[] },
  ) {
    if (
      actorId === id &&
      ((input.status && input.status !== 'ACTIVE') ||
        (input.roleCodes && !input.roleCodes.includes('ADMIN')))
    )
      throw new ForbiddenException(
        'Administrators cannot deactivate or remove their own administrator role.',
      );
    await this.database.transaction(async (client) => {
      const found = await client.query(
        'SELECT id FROM app_auth.users WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
        [id],
      );
      if (!found.rowCount) throw new NotFoundException('Account not found.');
      if (input.status && !['ACTIVE', 'SUSPENDED'].includes(input.status))
        throw new BadRequestException('Status must be ACTIVE or SUSPENDED.');
      if (input.fullName !== undefined || input.status !== undefined)
        await client.query(
          `UPDATE app_auth.users SET full_name = COALESCE($2, full_name), status = COALESCE($3, status), token_version = CASE WHEN $3 = 'SUSPENDED' THEN token_version + 1 ELSE token_version END WHERE id = $1`,
          [id, input.fullName?.trim() || null, input.status ?? null],
        );
      if (input.roleCodes)
        await this.replaceRoles(client, id, normalizedRoles(input.roleCodes));
      if (input.status === 'SUSPENDED')
        await client.query(
          `UPDATE app_auth.refresh_tokens SET revoked_at = CURRENT_TIMESTAMP, revoke_reason = 'ADMIN_SUSPENDED' WHERE user_id = $1 AND revoked_at IS NULL`,
          [id],
        );
    });
    return this.get(id);
  }

  async remove(actorId: string, id: string) {
    if (actorId === id)
      throw new ForbiddenException(
        'Administrators cannot delete their own account.',
      );
    await this.database.transaction(async (client) => {
      const target = await client.query<{ is_admin: boolean }>(
        `SELECT EXISTS(SELECT 1 FROM app_auth.user_roles ur JOIN app_auth.roles r ON r.id=ur.role_id WHERE ur.user_id=$1 AND r.code='ADMIN') AS is_admin FROM app_auth.users WHERE id=$1 AND deleted_at IS NULL FOR UPDATE`,
        [id],
      );
      if (!target.rowCount) throw new NotFoundException('Account not found.');
      if (target.rows[0].is_admin) {
        const admins = await client.query(
          `SELECT COUNT(*) AS count FROM app_auth.user_roles ur JOIN app_auth.roles r ON r.id=ur.role_id JOIN app_auth.users u ON u.id=ur.user_id WHERE r.code='ADMIN' AND u.deleted_at IS NULL`,
        );
        if (Number(admins.rows[0].count) < 2)
          throw new ForbiddenException(
            'The last administrator account cannot be deleted.',
          );
      }
      await client.query(
        `UPDATE app_auth.users SET status='DELETED', deleted_at=CURRENT_TIMESTAMP, token_version=token_version+1 WHERE id=$1`,
        [id],
      );
      await client.query(
        `UPDATE app_auth.refresh_tokens SET revoked_at=CURRENT_TIMESTAMP, revoke_reason='ADMIN_DELETED' WHERE user_id=$1 AND revoked_at IS NULL`,
        [id],
      );
    });
    return { message: 'Account deleted.' };
  }

  private async replaceRoles(
    client: import('pg').PoolClient,
    userId: string,
    roles: string[],
  ) {
    const available = await client.query<{ code: string }>(
      `SELECT code FROM app_auth.roles WHERE code = ANY($1::varchar[])`,
      [roles],
    );
    if (available.rowCount !== roles.length)
      throw new BadRequestException('One or more role codes are invalid.');
    await client.query('DELETE FROM app_auth.user_roles WHERE user_id=$1', [
      userId,
    ]);
    await client.query(
      `INSERT INTO app_auth.user_roles (user_id, role_id) SELECT $1, id FROM app_auth.roles WHERE code = ANY($2::varchar[])`,
      [userId, roles],
    );
  }
}
function normalizedRoles(roles?: string[]) {
  const result = [
    ...new Set(
      (roles?.length ? roles : ['USER']).map((role) =>
        role.trim().toUpperCase(),
      ),
    ),
  ];
  if (!result.length)
    throw new BadRequestException('At least one role is required.');
  return result;
}
