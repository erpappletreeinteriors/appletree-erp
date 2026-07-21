/**
 * Roles available in the Manufacturing ERP, taken from the stated target users.
 *
 * Modeled as a const object + string-literal union (matching Prisma's own generated
 * enum shape) rather than a TS `enum`, so this type is structurally assignable
 * to/from `@prisma/client`'s generated `Role` without casts.
 */
export const Role = {
  ADMIN: 'ADMIN',
  DESIGNER: 'DESIGNER',
  PRODUCTION_MANAGER: 'PRODUCTION_MANAGER',
  FACTORY_USER: 'FACTORY_USER',
  VIEWER: 'VIEWER',
} as const;

export type Role = (typeof Role)[keyof typeof Role];

export const ALL_ROLES: Role[] = Object.values(Role);
