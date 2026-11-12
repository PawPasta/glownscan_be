export const ADMIN_ACCOUNT_PORT = Symbol('ADMIN_ACCOUNT_PORT');

export interface AdminAccountRecord {
  id: string;
  email: string;
  fullName: string | null;
  status: string;
  emailVerifiedAt: Date | null;
  createdAt: Date;
  roles: string[];
}

export interface AdminAccountPort {
  list(
    page: number,
    limit: number,
    search?: string,
  ): Promise<{
    items: AdminAccountRecord[];
    page: number;
    limit: number;
    total: number;
  }>;
  findById(id: string): Promise<AdminAccountRecord | null>;
  createAccount(input: {
    email: string;
    passwordHash: string;
    fullName: string | null;
    roleCodes: string[];
  }): Promise<string>;
  updateAccount(input: {
    id: string;
    fullName?: string;
    status?: string;
    roleCodes?: string[];
  }): Promise<boolean>;
  removeAccount(id: string): Promise<'REMOVED' | 'NOT_FOUND' | 'LAST_ADMIN'>;
}
