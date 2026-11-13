export const ACCESS_PERMISSION_PORT = Symbol('ACCESS_PERMISSION_PORT');

export interface AccessPermissionPort {
  hasPermission(userId: string, permissionCode: string): Promise<boolean>;
}
