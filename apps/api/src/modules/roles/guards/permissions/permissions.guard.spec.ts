
import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { EffectivePermissionsService } from '../../services/permissions/effective-permissions.service';
import { PermissionsGuard } from './permissions.guard';

describe('PermissionsGuard', () => {
  let guard: PermissionsGuard;

  let reflector: {
    getAllAndOverride: jest.Mock;
  };

  let effectivePermissionsService: {
    findEffectivePermissions: jest.Mock<
      (organizationId: string, membershipId: string) => Promise<string[]>
    >;
  };

  let request: {
    user?: { id: string };
    organizationContext?: {
      organizationId: string;
      membershipId: string;
    };
  };

  let executionContext: ExecutionContext;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    };

    effectivePermissionsService = {
      findEffectivePermissions: jest.fn<
        (organizationId: string, membershipId: string) => Promise<string[]>
      >(),
    };

    request = {
      user: { id: 'user-123' },
      organizationContext: {
        organizationId: 'organization-123',
        membershipId: 'membership-456',
      },
    };

    executionContext = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue(request),
      }),
    } as unknown as ExecutionContext;

    guard = new PermissionsGuard(
      reflector as unknown as Reflector,
      effectivePermissionsService as unknown as EffectivePermissionsService,
    );
  });

  it('should allow access when all required permissions exist', async () => {
    reflector.getAllAndOverride.mockReturnValue([
      'organizations.read',
      'memberships.read',
    ]);

    effectivePermissionsService.findEffectivePermissions.mockResolvedValue([
      'organizations.read',
      'memberships.read',
      'roles.read',
    ]);

    await expect(guard.canActivate(executionContext)).resolves.toBe(true);

    expect(
      effectivePermissionsService.findEffectivePermissions,
    ).toHaveBeenCalledWith('organization-123', 'membership-456');
  });

  it('should deny access when a required permission is missing', async () => {
    reflector.getAllAndOverride.mockReturnValue([
      'organizations.read',
      'organizations.update',
    ]);

    effectivePermissionsService.findEffectivePermissions.mockResolvedValue([
      'organizations.read',
    ]);

    await expect(
      guard.canActivate(executionContext),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('should deny access when permission metadata is missing', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    await expect(
      guard.canActivate(executionContext),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(
      effectivePermissionsService.findEffectivePermissions,
    ).not.toHaveBeenCalled();
  });

  it('should reject requests without an authenticated user', async () => {
    reflector.getAllAndOverride.mockReturnValue(['organizations.read']);
    request.user = undefined;

    await expect(
      guard.canActivate(executionContext),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('should reject requests without organization context', async () => {
    reflector.getAllAndOverride.mockReturnValue(['organizations.read']);
    request.organizationContext = undefined;

    await expect(
      guard.canActivate(executionContext),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('should reject an empty permission array', async () => {
    reflector.getAllAndOverride.mockReturnValue([]);

    await expect(
      guard.canActivate(executionContext),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(
      effectivePermissionsService.findEffectivePermissions,
    ).not.toHaveBeenCalled();
  });

  it('should reject whitespace-only permission metadata', async () => {
    reflector.getAllAndOverride.mockReturnValue(['   ']);

    await expect(
      guard.canActivate(executionContext),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(
      effectivePermissionsService.findEffectivePermissions,
    ).not.toHaveBeenCalled();
  });

  it('should require every permission when multiple are configured', async () => {
    reflector.getAllAndOverride.mockReturnValue([
      'organizations.read',
      'memberships.manage',
    ]);

    effectivePermissionsService.findEffectivePermissions.mockResolvedValue([
      'organizations.read',
    ]);

    await expect(
      guard.canActivate(executionContext),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('should propagate permission resolution errors', async () => {
    reflector.getAllAndOverride.mockReturnValue(['organizations.read']);

    effectivePermissionsService.findEffectivePermissions.mockRejectedValue(
      new Error('Database connection failed'),
    );

    await expect(
      guard.canActivate(executionContext),
    ).rejects.toThrow('Database connection failed');
  });
});
