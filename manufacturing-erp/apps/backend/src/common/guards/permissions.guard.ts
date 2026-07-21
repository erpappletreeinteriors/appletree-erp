import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Permission, ROLE_PERMISSIONS } from '@appletree/shared-types';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { RequestUser } from '../../modules/auth/request-user.interface';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<Permission[] | undefined>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user: RequestUser | undefined = request.user;

    if (!user) {
      return false;
    }

    const grantedPermissions = ROLE_PERMISSIONS[user.role];
    return requiredPermissions.every((permission) => grantedPermissions.includes(permission));
  }
}
