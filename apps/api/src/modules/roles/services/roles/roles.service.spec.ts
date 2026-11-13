import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Repository } from 'typeorm';

import { Role } from '../../entities/role.entity';
import { RolesService } from './roles.service';

describe('RolesService', () => {
  let service: RolesService;

  const queryBuilder = {
    where: jest.fn(),
    andWhere: jest.fn(),
    orderBy: jest.fn(),
    addOrderBy: jest.fn(),
    getMany: jest.fn<() => Promise<Role[]>>(),
  };

  const roleRepository = {
    createQueryBuilder: jest.fn(),
  } as unknown as Repository<Role>;

  beforeEach(() => {
    jest.clearAllMocks();

    queryBuilder.where.mockReturnValue(queryBuilder);
    queryBuilder.andWhere.mockReturnValue(queryBuilder);
    queryBuilder.orderBy.mockReturnValue(queryBuilder);
    queryBuilder.addOrderBy.mockReturnValue(queryBuilder);

    (roleRepository.createQueryBuilder as jest.Mock).mockReturnValue(
      queryBuilder,
    );

    service = new RolesService(roleRepository);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return the roles retrieved by the query builder', async () => {
    const expectedRoles = [
      { id: 'system-role-1', code: 'SYSTEM_ADMIN' },
      { id: 'organization-role-1', code: 'ORG_ADMIN' },
    ] as Role[];

    queryBuilder.getMany.mockResolvedValue(expectedRoles);

    const result = await service.findAvailableRoles(
      '11111111-1111-4111-8111-111111111111',
    );

    expect(result).toEqual(expectedRoles);
    expect(roleRepository.createQueryBuilder).toHaveBeenCalledWith('role');
    expect(queryBuilder.getMany).toHaveBeenCalledTimes(1);
  });

  it('should filter for active system roles and organization-owned custom roles', async () => {
    const organizationId = '11111111-1111-4111-8111-111111111111';

    queryBuilder.getMany.mockResolvedValue([]);

    await service.findAvailableRoles(organizationId);

    expect(queryBuilder.where).toHaveBeenCalledWith(
      'role.isActive = :isActive',
      { isActive: true },
    );

    const [condition, parameters] =
      queryBuilder.andWhere.mock.calls[0] as unknown as [
        string,
        Record<string, unknown>,
      ];

    expect(condition).toContain('role.isSystemRole');
    expect(condition).toContain('role.organizationId IS NULL');
    expect(condition).toContain('role.organizationId = :organizationId');

    expect(parameters).toEqual({
      systemRole: true,
      organizationRole: false,
      organizationId,
    });
  });

  it('should order system roles first and then alphabetically by name', async () => {
    queryBuilder.getMany.mockResolvedValue([]);

    await service.findAvailableRoles(
      '11111111-1111-4111-8111-111111111111',
    );

    expect(queryBuilder.orderBy).toHaveBeenCalledWith(
      'role.isSystemRole',
      'DESC',
    );

    expect(queryBuilder.addOrderBy).toHaveBeenCalledWith(
      'role.name',
      'ASC',
    );
  });
});
