import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { EffectivePermissionsService } from '../../services/permissions/effective-permissions.service';
import { REQUIRED_PERMISSIONS_KEY } from '../../decorators/require-permissions.decorator';
import type { OrganizationRequestContext } from '../../../organization-memberships/guards/organization-context/organization-context.guard';

interface AuthenticatedPermissionRequest {
  user?: {
    id: string;
  };
  organizationContext?: OrganizationRequestContext;
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly effectivePermissionsService: EffectivePermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      REQUIRED_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (
      !requiredPermissions ||
      requiredPermissions.length === 0 ||
      requiredPermissions.some(
        (permission) =>
          typeof permission !== 'string' || permission.trim().length === 0,
      )
    ) {
      throw new ForbiddenException(
        'No valid permissions have been configured for this endpoint.',
      );
    }

    const request =
      context.switchToHttp().getRequest<AuthenticatedPermissionRequest>();

    if (!request.user?.id) {
      throw new UnauthorizedException('Authentication is required.');
    }

    const organizationContext = request.organizationContext;

    if (
      !organizationContext?.organizationId ||
      !organizationContext?.membershipId
    ) {
      throw new ForbiddenException(
        'A verified organization context is required.',
      );
    }

    const effectivePermissions =
      await this.effectivePermissionsService.findEffectivePermissions(
        organizationContext.organizationId,
        organizationContext.membershipId,
      );

    const permissionSet = new Set(effectivePermissions);

    const hasAllPermissions = requiredPermissions.every((permission) =>
      permissionSet.has(permission),
    );

    if (!hasAllPermissions) {
      throw new ForbiddenException(
        'You do not have the required permissions for this action.',
      );
    }

    return true;
  }
}
