import {
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';

import { GUARDS_METADATA } from '@nestjs/common/constants';

import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';
import { OrganizationContextGuard } from '../organization-memberships/guards/organization-context/organization-context.guard';
import { PermissionsGuard } from '../roles/guards/permissions/permissions.guard';
import { REQUIRED_PERMISSIONS_KEY } from '../roles/decorators/require-permissions.decorator';
import { RolesService } from '../roles/services/roles/roles.service';
import { MembershipRolesService } from '../roles/services/membership-roles/membership-roles.service';
import { OrganizationMembershipsService } from '../organization-memberships/organization-memberships.service';

import { OrganizationsController } from './organizations.controller';

describe('OrganizationsController', () => {
  let controller: OrganizationsController;

  const rolesService = {
    findAvailableRoles: jest.fn<
      (organizationId: string) => Promise<unknown>
    >(),
  };

  const organizationMembershipsService = {
    findOrganizationMemberships: jest.fn<
      (organizationId: string, page: number, limit: number) => Promise<unknown>
    >(),
  };

  const membershipRolesService = {
    assignRole: jest.fn<
      (
        organizationId: string,
        membershipId: string,
        roleId: string,
        actorUserId: string,
      ) => Promise<{
        id: string;
        organizationId: string;
        membershipId: string;
        roleId: string;
        assignedAt: Date;
      }>
    >(),
    removeRole: jest.fn<
      (
        organizationId: string,
        membershipId: string,
        roleId: string,
        actorUserId: string,
      ) => Promise<void>
    >(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    controller = new OrganizationsController(
      rolesService as unknown as RolesService,
      membershipRolesService as unknown as MembershipRolesService,
      organizationMembershipsService as unknown as OrganizationMembershipsService,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should confirm successful authentication', () => {
    const request = {
      user: {
        id: 'test-user-123',
      },
    };

    expect(controller.checkAuthentication(request)).toEqual({
      authenticated: true,
      userId: 'test-user-123',
      message: 'Epiqora API authentication successful.',
    });
  });

  it('should apply JwtAuthGuard to the controller', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      OrganizationsController,
    );

    expect(guards).toContain(JwtAuthGuard);
  });

  it('should return the verified organization context', () => {
    const request = {
      user: {
        id: 'test-user-123',
      },
      organizationContext: {
        organizationId: '550e8400-e29b-41d4-a716-446655440000',
        membershipId: 'membership-123',
      },
    };

    expect(
      controller.getOrganizationContext(request),
    ).toEqual({
      authenticated: true,
      organizationId: '550e8400-e29b-41d4-a716-446655440000',
      membershipId: 'membership-123',
      message: 'Organization context successfully verified.',
    });
  });

  it('should apply OrganizationContextGuard to the context endpoint', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      OrganizationsController.prototype.getOrganizationContext,
    );

    expect(guards).toContain(OrganizationContextGuard);
  });

  it('should not apply OrganizationContextGuard to the authentication-check endpoint', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      OrganizationsController.prototype.checkAuthentication,
    );

    expect(guards ?? []).not.toContain(OrganizationContextGuard);
  });

  it('should return roles for the verified organization', async () => {
    const organizationId = '550e8400-e29b-41d4-a716-446655440000';
    const expectedRoles = [
      {
        id: 'role-1',
        code: 'INSTITUTION_ADMIN',
        isSystemRole: true,
      },
    ];

    rolesService.findAvailableRoles.mockResolvedValue(expectedRoles);

    const request = {
      user: {
        id: 'test-user-123',
      },
      organizationContext: {
        organizationId,
        membershipId: 'membership-123',
      },
    };

    await expect(
      controller.findAvailableRoles(request),
    ).resolves.toEqual(expectedRoles);

    expect(
      rolesService.findAvailableRoles,
    ).toHaveBeenCalledWith(organizationId);
  });

  it('should apply organization and permission guards to the roles endpoint in the correct order', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      OrganizationsController.prototype.findAvailableRoles,
    );

    expect(guards).toEqual([
      OrganizationContextGuard,
      PermissionsGuard,
    ]);
  });

  it('should require roles.read on the roles endpoint', () => {
    const permissions = Reflect.getMetadata(
      REQUIRED_PERMISSIONS_KEY,
      OrganizationsController.prototype.findAvailableRoles,
    );

    expect(permissions).toEqual(['roles.read']);
  });

  it('should list memberships using the verified organization context', async () => {
    const organizationId = '550e8400-e29b-41d4-a716-446655440000';
    const expectedResult = {
      data: [
        {
          id: 'membership-1',
          organizationId,
          status: 'ACTIVE',
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
    };

    organizationMembershipsService.findOrganizationMemberships.mockResolvedValue(
      expectedResult,
    );

    const request = {
      user: {
        id: 'test-user-123',
      },
      organizationContext: {
        organizationId,
        membershipId: 'membership-123',
      },
    };

    await expect(
      controller.findOrganizationMemberships(request, 1, 20),
    ).resolves.toEqual(expectedResult);

    expect(
      organizationMembershipsService.findOrganizationMemberships,
    ).toHaveBeenCalledWith(organizationId, 1, 20);
  });

  it('should pass custom pagination values to the membership service', async () => {
    organizationMembershipsService.findOrganizationMemberships.mockResolvedValue({
      data: [],
      total: 45,
      page: 2,
      limit: 10,
    });

    const request = {
      user: {
        id: 'test-user-123',
      },
      organizationContext: {
        organizationId: '550e8400-e29b-41d4-a716-446655440000',
        membershipId: 'membership-123',
      },
    };

    await expect(
      controller.findOrganizationMemberships(request, 2, 10),
    ).resolves.toEqual({
      data: [],
      total: 45,
      page: 2,
      limit: 10,
    });

    expect(
      organizationMembershipsService.findOrganizationMemberships,
    ).toHaveBeenCalledWith(
      '550e8400-e29b-41d4-a716-446655440000',
      2,
      10,
    );
  });

  it('should apply organization and permission guards to membership listing in the correct order', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      OrganizationsController.prototype.findOrganizationMemberships,
    );

    expect(guards).toEqual([
      OrganizationContextGuard,
      PermissionsGuard,
    ]);
  });

  it('should require memberships.read on the membership listing endpoint', () => {
    const permissions = Reflect.getMetadata(
      REQUIRED_PERMISSIONS_KEY,
      OrganizationsController.prototype.findOrganizationMemberships,
    );

    expect(permissions).toEqual(['memberships.read']);
  });

  it('should assign a role using the verified organization context', async () => {
    const organizationId = '550e8400-e29b-41d4-a716-446655440000';
    const membershipId = '660e8400-e29b-41d4-a716-446655440000';
    const roleId = '770e8400-e29b-41d4-a716-446655440000';
    const assignedAt = new Date('2026-11-11T08:00:00.000Z');

    const assignment = {
      id: '880e8400-e29b-41d4-a716-446655440000',
      organizationId,
      membershipId,
      roleId,
      assignedAt,
    };

    membershipRolesService.assignRole.mockResolvedValue(assignment);

    const request = {
      user: {
        id: 'test-user-123',
      },
      organizationContext: {
        organizationId,
        membershipId: '990e8400-e29b-41d4-a716-446655440000',
      },
    };

    await expect(
      controller.assignRole(
        membershipId,
        { roleId },
        request,
      ),
    ).resolves.toEqual(assignment);

    expect(
      membershipRolesService.assignRole,
    ).toHaveBeenCalledWith(
      organizationId,
      membershipId,
      roleId,
      'test-user-123',
    );
  });

  it('should apply organization and permission guards to role assignment in the correct order', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      OrganizationsController.prototype.assignRole,
    );

    expect(guards).toEqual([
      OrganizationContextGuard,
      PermissionsGuard,
    ]);
  });

  it('should require roles.assign on the assignment endpoint', () => {
    const permissions = Reflect.getMetadata(
      REQUIRED_PERMISSIONS_KEY,
      OrganizationsController.prototype.assignRole,
    );

    expect(permissions).toEqual(['roles.assign']);
  });

  it('should remove a role using the verified organization context', async () => {
    const organizationId = '550e8400-e29b-41d4-a716-446655440000';
    const membershipId = '660e8400-e29b-41d4-a716-446655440000';
    const roleId = '770e8400-e29b-41d4-a716-446655440000';

    membershipRolesService.removeRole.mockResolvedValue(undefined);

    const request = {
      user: {
        id: 'test-user-123',
      },
      organizationContext: {
        organizationId,
        membershipId: '990e8400-e29b-41d4-a716-446655440000',
      },
    };

    await expect(
      controller.removeRole(
        membershipId,
        roleId,
        request,
      ),
    ).resolves.toEqual({
      message: 'Role assignment removed successfully.',
    });

    expect(
      membershipRolesService.removeRole,
    ).toHaveBeenCalledWith(
      organizationId,
      membershipId,
      roleId,
      'test-user-123',
    );
  });

  it('should apply organization and permission guards to role removal in the correct order', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      OrganizationsController.prototype.removeRole,
    );

    expect(guards).toEqual([
      OrganizationContextGuard,
      PermissionsGuard,
    ]);
  });

  it('should require roles.assign on the role removal endpoint', () => {
    const permissions = Reflect.getMetadata(
      REQUIRED_PERMISSIONS_KEY,
      OrganizationsController.prototype.removeRole,
    );

    expect(permissions).toEqual(['roles.assign']);
  });
});
