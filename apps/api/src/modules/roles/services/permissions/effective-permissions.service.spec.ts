import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Repository } from 'typeorm';

import { MembershipRole } from '../../entities/membership-role.entity';
import { EffectivePermissionsService } from './effective-permissions.service';

describe('EffectivePermissionsService', () => {
  let service: EffectivePermissionsService;

  let queryBuilder: {
    innerJoin: jest.Mock;
    where: jest.Mock;
    andWhere: jest.Mock;
    select: jest.Mock;
    distinct: jest.Mock;
    getRawMany: jest.Mock<() => Promise<{ code: string }[]>>;
  };

  let membershipRoleRepository: {
    createQueryBuilder: jest.Mock;
  };

  beforeEach(() => {
    queryBuilder = {
      innerJoin: jest.fn(),
      where: jest.fn(),
      andWhere: jest.fn(),
      select: jest.fn(),
      distinct: jest.fn(),
      getRawMany: jest.fn<() => Promise<{ code: string }[]>>(),
    };

    queryBuilder.innerJoin.mockReturnValue(queryBuilder);
    queryBuilder.where.mockReturnValue(queryBuilder);
    queryBuilder.andWhere.mockReturnValue(queryBuilder);
    queryBuilder.select.mockReturnValue(queryBuilder);
    queryBuilder.distinct.mockReturnValue(queryBuilder);

    membershipRoleRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };

    service = new EffectivePermissionsService(
      membershipRoleRepository as unknown as Repository<MembershipRole>,
    );
  });

  it('should return effective permission codes', async () => {
    queryBuilder.getRawMany.mockResolvedValue([
      { code: 'organizations.read' },
      { code: 'memberships.read' },
      { code: 'roles.read' },
    ]);

    const result = await service.findEffectivePermissions(
      'organization-123',
      'membership-456',
    );

    expect(result).toEqual([
      'organizations.read',
      'memberships.read',
      'roles.read',
    ]);

    expect(membershipRoleRepository.createQueryBuilder).toHaveBeenCalledWith(
      'membershipRole',
    );

      expect(queryBuilder.distinct).toHaveBeenCalledWith(true);
  });

  it('should return an empty array when no permissions are found', async () => {
    queryBuilder.getRawMany.mockResolvedValue([]);

    const result = await service.findEffectivePermissions(
      'organization-123',
      'membership-456',
    );

    expect(result).toEqual([]);
  });

  it('should filter results by organization and membership', async () => {
    queryBuilder.getRawMany.mockResolvedValue([]);

    await service.findEffectivePermissions(
      'organization-123',
      'membership-456',
    );

    expect(queryBuilder.where).toHaveBeenCalledWith(
      'membershipRole.organizationId = :organizationId',
      { organizationId: 'organization-123' },
    );

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'membershipRole.membershipId = :membershipId',
      { membershipId: 'membership-456' },
    );
  });

  it('should require an active organization membership', async () => {
    queryBuilder.getRawMany.mockResolvedValue([]);

    await service.findEffectivePermissions(
      'organization-123',
      'membership-456',
    );

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'membership.status = :membershipStatus',
      { membershipStatus: 'ACTIVE' },
    );
  });

  it('should require an active organization', async () => {
    queryBuilder.getRawMany.mockResolvedValue([]);

    await service.findEffectivePermissions(
      'organization-123',
      'membership-456',
    );

    expect(queryBuilder.innerJoin).toHaveBeenCalledWith(
      expect.anything(),
      'organization',
      'organization.id = membershipRole.organizationId',
    );

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'organization.isActive = :organizationIsActive',
      { organizationIsActive: true },
    );
  });

  it('should exclude inactive roles', async () => {
    queryBuilder.getRawMany.mockResolvedValue([]);

    await service.findEffectivePermissions(
      'organization-123',
      'membership-456',
    );

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'role.isActive = :roleIsActive',
      { roleIsActive: true },
    );
  });

  it('should exclude inactive permissions', async () => {
    queryBuilder.getRawMany.mockResolvedValue([]);

    await service.findEffectivePermissions(
      'organization-123',
      'membership-456',
    );

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'permission.isActive = :permissionIsActive',
      { permissionIsActive: true },
    );
  });

  it('should allow system roles and restrict custom roles to their organization', async () => {
    queryBuilder.getRawMany.mockResolvedValue([]);

    await service.findEffectivePermissions(
      'organization-123',
      'membership-456',
    );

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      '(role.isSystemRole = TRUE OR role.organizationId = membershipRole.organizationId)',
    );
  });

  it('should request distinct permission codes from the database', async () => {
    queryBuilder.getRawMany.mockResolvedValue([
      { code: 'organizations.read' },
      { code: 'roles.read' },
    ]);

    const result = await service.findEffectivePermissions(
      'organization-123',
      'membership-456',
    );

      expect(queryBuilder.distinct).toHaveBeenCalledWith(true);

    expect(result).toEqual([
      'organizations.read',
      'roles.read',
    ]);
  });

  it('should propagate database errors', async () => {
    const databaseError = new Error('Database connection failed');

    queryBuilder.getRawMany.mockRejectedValue(databaseError);

    await expect(
      service.findEffectivePermissions(
        'organization-123',
        'membership-456',
      ),
    ).rejects.toThrow('Database connection failed');
  });
});
