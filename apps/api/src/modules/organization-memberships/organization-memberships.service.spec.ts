import {
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { OrganizationMembershipsService } from './organization-memberships.service';
import { OrganizationMembership } from './entities/organization-membership.entity';
import { MembershipStatus } from './enums/membership-status.enum';
import { Organization } from '../organizations/entities/organization.entity';

describe('OrganizationMembershipsService', () => {
  let service: OrganizationMembershipsService;

  const findOneMock = jest.fn() as jest.MockedFunction<
    Repository<OrganizationMembership>['findOne']
  >;

  const findAndCountMock = jest.fn() as jest.MockedFunction<
    Repository<OrganizationMembership>['findAndCount']
  >;

  const membershipRepository = {
    findOne: findOneMock,
    findAndCount: findAndCountMock,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationMembershipsService,
        {
          provide: getRepositoryToken(OrganizationMembership),
          useValue: membershipRepository,
        },
      ],
    }).compile();

    service = module.get<OrganizationMembershipsService>(
      OrganizationMembershipsService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should find an active membership in an active organization', async () => {
    const organization: Organization = {
      id: 'organization-1',
      name: 'Test Organization',
      code: 'TEST-ORG',
      organizationType: 'HEALTH_AUTHORITY',
      isActive: true,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    };

    const membership: OrganizationMembership = {
      id: 'membership-1',
      organizationId: 'organization-1',
      keycloakUserId: 'user-1',
      status: MembershipStatus.ACTIVE,
      joinedAt: new Date('2026-01-01T00:00:00Z'),
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
      organization,
    };

    findOneMock.mockResolvedValue(membership);

    const result = await service.findActiveMembership(
      'organization-1',
      'user-1',
    );

    expect(result).toEqual(membership);

    expect(findOneMock).toHaveBeenCalledWith({
      where: {
        organizationId: 'organization-1',
        keycloakUserId: 'user-1',
        status: MembershipStatus.ACTIVE,
        organization: {
          isActive: true,
        },
      },
      relations: {
        organization: true,
      },
    });
  });

  it('should return null when no eligible membership exists', async () => {
    findOneMock.mockResolvedValue(null);

    const result = await service.findActiveMembership(
      'organization-1',
      'user-1',
    );

    expect(result).toBeNull();
  });

  it('should not find a membership belonging to another organization', async () => {
    findOneMock.mockResolvedValue(null);

    const result = await service.findActiveMembership(
      'organization-2',
      'user-1',
    );

    expect(result).toBeNull();

    expect(findOneMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'organization-2',
          keycloakUserId: 'user-1',
        }),
      }),
    );
  });

  it('should list memberships scoped to the requested organization', async () => {
    const memberships: OrganizationMembership[] = [
      {
        id: 'membership-1',
        organizationId: 'organization-1',
        keycloakUserId: 'user-1',
        status: MembershipStatus.ACTIVE,
        joinedAt: new Date('2026-01-01T00:00:00Z'),
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
        organization: {
          id: 'organization-1',
          name: 'Test Organization',
          code: 'TEST-ORG',
          organizationType: 'HEALTH_AUTHORITY',
          isActive: true,
          createdAt: new Date('2026-01-01T00:00:00Z'),
          updatedAt: new Date('2026-01-01T00:00:00Z'),
        },
      },
    ];

    findAndCountMock.mockResolvedValue([memberships, 1]);

    const result = await service.findOrganizationMemberships(
      'organization-1',
    );

    expect(result).toEqual({
      data: memberships,
      total: 1,
      page: 1,
      limit: 20,
    });

    expect(findAndCountMock).toHaveBeenCalledWith({
      select: {
        id: true,
        organizationId: true,
        status: true,
        joinedAt: true,
        createdAt: true,
      },
      where: {
        organizationId: 'organization-1',
      },
      order: {
        createdAt: 'DESC',
      },
      skip: 0,
      take: 20,
    });
  });

  it('should apply custom pagination', async () => {
    findAndCountMock.mockResolvedValue([[], 45]);

    const result = await service.findOrganizationMemberships(
      'organization-1',
      2,
      10,
    );

    expect(result).toEqual({
      data: [],
      total: 45,
      page: 2,
      limit: 10,
    });

    expect(findAndCountMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: 'organization-1',
        },
        skip: 10,
        take: 10,
      }),
    );
  });

  it('should enforce pagination boundaries', async () => {
    findAndCountMock.mockResolvedValue([[], 0]);

    const result = await service.findOrganizationMemberships(
      'organization-1',
      -5,
      500,
    );

    expect(result.page).toBe(1);
    expect(result.limit).toBe(100);

    expect(findAndCountMock).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 100,
      }),
    );
  });

  it('should not select the Keycloak user ID', async () => {
    findAndCountMock.mockResolvedValue([[], 0]);

    await service.findOrganizationMemberships('organization-1');

    const query = findAndCountMock.mock.calls[0][0];

    expect(query?.select).toEqual({
      id: true,
      organizationId: true,
      status: true,
      joinedAt: true,
      createdAt: true,
    });

    expect(query?.select).not.toHaveProperty('keycloakUserId');
  });
});
