import { Inject, Injectable } from '@nestjs/common';
import { AuditLogService } from '../../../audit/application/use-case/audit-log.service.js';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '../../../../shared/handler/http.exceptions.js';
import {
  ADMIN_ACCOUNT_PORT,
  type AdminAccountPort,
} from '../ports/admin-account.port.js';
import {
  PASSWORD_HASHER_PORT,
  type PasswordHasherPort,
} from '../ports/password-hasher.port.js';

@Injectable()
export class AdminAccountService {
  constructor(
    @Inject(ADMIN_ACCOUNT_PORT)
    private readonly accounts: AdminAccountPort,
    @Inject(PASSWORD_HASHER_PORT)
    private readonly passwordHasher: PasswordHasherPort,
    private readonly auditLog: AuditLogService,
  ) {}

  async list(page: number, limit: number, search?: string) {
    return this.accounts.list(page, limit, search);
  }

  async get(id: string) {
    const account = await this.accounts.findById(id);
    if (!account) throw new NotFoundException('Account not found.');
    return account;
  }

  async create(input: {
    actorId: string;
    email: string;
    password: string;
    fullName?: string;
    roleCodes?: string[];
  }) {
    const email = input.email.trim().toLowerCase();
    const roles = normalizedRoles(input.roleCodes);
    let id: string;
    try {
      id = await this.accounts.createAccount({
        email,
        passwordHash: await this.passwordHasher.hash(input.password),
        fullName: input.fullName?.trim() || null,
        roleCodes: roles,
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'ACCOUNT_EMAIL_EXISTS')
        throw new ConflictException(
          'An account already exists for this email.',
        );
      if (error instanceof Error && error.message === 'INVALID_ROLE_CODES')
        throw new BadRequestException('One or more role codes are invalid.');
      throw error;
    }
    await this.auditLog.record({
      actorUserId: input.actorId,
      action: 'ADMIN_ACCOUNT_CREATED',
      resourceType: 'USER_ACCOUNT',
      resourceId: id,
      metadata: { roleCodes: roles },
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
    if (input.status && !['ACTIVE', 'SUSPENDED'].includes(input.status))
      throw new BadRequestException('Status must be ACTIVE or SUSPENDED.');
    let updated: boolean;
    try {
      updated = await this.accounts.updateAccount({
        id,
        fullName: input.fullName?.trim(),
        status: input.status,
        roleCodes: input.roleCodes
          ? normalizedRoles(input.roleCodes)
          : undefined,
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'INVALID_ROLE_CODES')
        throw new BadRequestException('One or more role codes are invalid.');
      throw error;
    }
    if (!updated) throw new NotFoundException('Account not found.');
    await this.auditLog.record({
      actorUserId: actorId,
      action: 'ADMIN_ACCOUNT_UPDATED',
      resourceType: 'USER_ACCOUNT',
      resourceId: id,
      metadata: { changedFields: Object.keys(input) },
    });
    return this.get(id);
  }

  async remove(actorId: string, id: string) {
    if (actorId === id)
      throw new ForbiddenException(
        'Administrators cannot delete their own account.',
      );
    const result = await this.accounts.removeAccount(id);
    if (result === 'NOT_FOUND')
      throw new NotFoundException('Account not found.');
    if (result === 'LAST_ADMIN')
      throw new ForbiddenException(
        'The last administrator account cannot be deleted.',
      );
    await this.auditLog.record({
      actorUserId: actorId,
      action: 'ADMIN_ACCOUNT_DELETED',
      resourceType: 'USER_ACCOUNT',
      resourceId: id,
    });
    return { message: 'Account deleted.' };
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
