import { Role } from './role';

/**
 * Fine-grained permission catalog, layered on top of roles. A role check answers
 * "is this user an Admin"; a permission check answers "can this user read audit
 * logs" — the latter stays stable even if the role that grants it changes later.
 */
export const Permission = {
  USERS_READ: 'users:read',
  USERS_WRITE: 'users:write',
  AUDIT_LOG_READ: 'audit-log:read',
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  [Role.ADMIN]: [Permission.USERS_READ, Permission.USERS_WRITE, Permission.AUDIT_LOG_READ],
  [Role.DESIGNER]: [],
  [Role.PRODUCTION_MANAGER]: [Permission.USERS_READ],
  [Role.FACTORY_USER]: [],
  [Role.VIEWER]: [],
};

export function roleHasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
