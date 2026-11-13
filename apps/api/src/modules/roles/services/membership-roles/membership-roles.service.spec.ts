import {
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';

import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

import {
  DataSource,
  EntityManager,
  QueryFailedError,
  Repository,
} from 'typeorm';

import { MembershipRole } from '../../entities/membership-role.entity';
import { Role } from '../../entities/role.entity';
import { OrganizationMembership } from '../../../organization-memberships/entities/organization-membership.entity';
import { MembershipStatus } from '../../../organization-memberships/enums/membership-status.enum';
import { AuditLog } from '../../../audit-logs/entities/audit-log.entity';
import {
  AuditLogsService,
  CreateAuditLogInput,
} from '../../../audit-logs/audit-logs.service';

import { MembershipRolesService } from './membership-roles.service';

describe('MembershipRolesService', () => {
  let service: MembershipRolesService;

  const organizationId = '11111111-1111-4111-8111-111111111111';
  const anotherOrganizationId = '22222222-2222-4222-8222-222222222222';
  const membershipId = '33333333-3333-4333-8333-333333333333';
  const roleId = '44444444-4444-4444-8444-444444444444';
  const assignmentId = '55555555-5555-4555-8555-555555555555';
  const actorUserId = 'actor-user-123';

  const membership: OrganizationMembership = {
    id: membershipId,
    organizationId,
    keycloakUserId: 'user-123',
    status: MembershipStatus.ACTIVE,
    joinedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    organization: {
      id: organizationId,
      isActive: true,
    },
  } as OrganizationMembership;

  const systemRole: Role = {
    id: roleId,
    organizationId: null,
    name: 'System Administrator',
    code: 'SYSTEM_ADMIN',
    description: null,
    isSystemRole: true,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    organization: null,
  } as Role;

  const existingAssignment: MembershipRole = {
    id: assignmentId,
    organizationId,
    membershipId,
    roleId,
  } as MembershipRole;

  const membershipFindOneMock = jest.fn<
    (options?: object) => Promise<OrganizationMembership | null>
  >();

  const roleFindOneMock = jest.fn<
    (options?: object) => Promise<Role | null>
  >();

  const assignmentFindOneMock = jest.fn<
    (options?: object) => Promise<MembershipRole | null>
  >();

  const assignmentCreateMock = jest.fn<
    (values: Partial<MembershipRole>) => MembershipRole
  >();

  const assignmentSaveMock = jest.fn<
    (assignment: MembershipRole) => Promise<MembershipRole>
  >();

  const assignmentRemoveMock = jest.fn<
    (assignment: MembershipRole) => Promise<MembershipRole[]>
  >();

  const auditRecordMock = jest.fn<
    (
      input: CreateAuditLogInput,
      manager: EntityManager,
    ) => Promise<AuditLog>
  >();

  const membershipRepository = {
    findOne: membershipFindOneMock,
  } as unknown as Repository<OrganizationMembership>;

  const roleRepository = {
    findOne: roleFindOneMock,
  } as unknown as Repository<Role>;

  const assignmentRepository = {
    findOne: assignmentFindOneMock,
    create: assignmentCreateMock,
    save: assignmentSaveMock,
    remove: assignmentRemoveMock,
  } as unknown as Repository<MembershipRole>;

  const manager = {
    getRepository: jest.fn(),
  } as unknown as EntityManager;

  const transactionMock = jest.fn<
    (
      callback: (manager: EntityManager) => Promise<unknown>,
    ) => Promise<unknown>
  >();

  const dataSource = {
    transaction: transactionMock,
  } as unknown as DataSource;

  const auditLogsService = {
    record: auditRecordMock,
  } as unknown as AuditLogsService;

  beforeEach(() => {
    jest.clearAllMocks();

    membershipFindOneMock.mockResolvedValue(membership);
    roleFindOneMock.mockResolvedValue(systemRole);
    assignmentFindOneMock.mockResolvedValue(null);

    assignmentCreateMock.mockImplementation(
      (values) => ({
        id: assignmentId,
        ...values,
      }) as MembershipRole,
    );

    assignmentSaveMock.mockImplementation(
      async (assignment) => assignment,
    );

    assignmentRemoveMock.mockImplementation(
      async (assignment) => [assignment],
    );

    auditRecordMock.mockResolvedValue({
      id: '66666666-6666-4666-8666-666666666666',
    } as AuditLog);

    (manager.getRepository as jest.Mock).mockImplementation(
      (entity: unknown) => {
        if (entity === OrganizationMembership) {
          return membershipRepository;
        }

        if (entity === Role) {
          return roleRepository;
        }

        if (entity === MembershipRole) {
          return assignmentRepository;
        }

        throw new Error('Unexpected repository requested.');
      },
    );

    transactionMock.mockImplementation(
      async (callback) => callback(manager),
    );

    service = new MembershipRolesService(
      dataSource,
      auditLogsService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should assign an active system role and record an audit event', async () => {
    const result = await service.assignRole(
      organizationId,
      membershipId,
      roleId,
      actorUserId,
    );

    expect(result).toEqual({
      id: assignmentId,
      organizationId,
      membershipId,
      roleId,
    });

    expect(assignmentSaveMock).toHaveBeenCalledTimes(1);

    expect(auditRecordMock).toHaveBeenCalledWith(
      {
        organizationId,
        actorUserId,
        action: 'ROLE_ASSIGNED',
        targetType: 'MEMBERSHIP_ROLE',
        targetId: assignmentId,
        metadata: {
          membershipId,
          roleId,
        },
      },
      manager,
    );

    expect(transactionMock).toHaveBeenCalledTimes(1);
  });

  it('should assign a custom role belonging to the same organization', async () => {
    roleFindOneMock.mockResolvedValue({
      ...systemRole,
      isSystemRole: false,
      organizationId,
    } as Role);

    const result = await service.assignRole(
      organizationId,
      membershipId,
      roleId,
      actorUserId,
    );

    expect(result).toEqual({
      id: assignmentId,
      organizationId,
      membershipId,
      roleId,
    });

    expect(assignmentSaveMock).toHaveBeenCalledTimes(1);
    expect(auditRecordMock).toHaveBeenCalledTimes(1);
  });

  it('should reject a membership that does not exist', async () => {
    membershipFindOneMock.mockResolvedValue(null);

    await expect(
      service.assignRole(
        organizationId,
        membershipId,
        roleId,
        actorUserId,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(assignmentSaveMock).not.toHaveBeenCalled();
    expect(auditRecordMock).not.toHaveBeenCalled();
  });

  it('should reject a membership that is not active', async () => {
    membershipFindOneMock.mockResolvedValue({
      ...membership,
      status: MembershipStatus.SUSPENDED,
    } as OrganizationMembership);

    await expect(
      service.assignRole(
        organizationId,
        membershipId,
        roleId,
        actorUserId,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(assignmentSaveMock).not.toHaveBeenCalled();
    expect(auditRecordMock).not.toHaveBeenCalled();
  });

  it('should reject a role that does not exist or is inactive', async () => {
    roleFindOneMock.mockResolvedValue(null);

    await expect(
      service.assignRole(
        organizationId,
        membershipId,
        roleId,
        actorUserId,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(assignmentSaveMock).not.toHaveBeenCalled();
    expect(auditRecordMock).not.toHaveBeenCalled();
  });

  it('should reject a custom role belonging to another organization', async () => {
    roleFindOneMock.mockResolvedValue({
      ...systemRole,
      isSystemRole: false,
      organizationId: anotherOrganizationId,
    } as Role);

    await expect(
      service.assignRole(
        organizationId,
        membershipId,
        roleId,
        actorUserId,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(assignmentSaveMock).not.toHaveBeenCalled();
    expect(auditRecordMock).not.toHaveBeenCalled();
  });

  it('should reject an existing role assignment', async () => {
    assignmentFindOneMock.mockResolvedValue(existingAssignment);

    await expect(
      service.assignRole(
        organizationId,
        membershipId,
        roleId,
        actorUserId,
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(assignmentSaveMock).not.toHaveBeenCalled();
    expect(auditRecordMock).not.toHaveBeenCalled();
  });

  it('should check the membership within the requested organization', async () => {
    await service.assignRole(
      organizationId,
      membershipId,
      roleId,
      actorUserId,
    );

    expect(membershipFindOneMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: membershipId,
          organizationId,
        }),
      }),
    );
  });

  it('should require an active organization when checking membership', async () => {
    await service.assignRole(
      organizationId,
      membershipId,
      roleId,
      actorUserId,
    );

    expect(membershipFindOneMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: membershipId,
          organizationId,
          organization: {
            isActive: true,
          },
        }),
      }),
    );
  });

  it('should remove a role assignment and record an audit event', async () => {
    assignmentFindOneMock.mockResolvedValue(existingAssignment);

    await expect(
      service.removeRole(
        organizationId,
        membershipId,
        roleId,
        actorUserId,
      ),
    ).resolves.toBeUndefined();

    expect(assignmentFindOneMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId,
          membershipId,
          roleId,
        },
      }),
    );

    expect(assignmentRemoveMock).toHaveBeenCalledWith(
      existingAssignment,
    );

    expect(auditRecordMock).toHaveBeenCalledWith(
      {
        organizationId,
        actorUserId,
        action: 'ROLE_REMOVED',
        targetType: 'MEMBERSHIP_ROLE',
        targetId: assignmentId,
        metadata: {
          membershipId,
          roleId,
        },
      },
      manager,
    );
  });

  it('should report when the requested role assignment does not exist', async () => {
    assignmentFindOneMock.mockResolvedValue(null);

    await expect(
      service.removeRole(
        organizationId,
        membershipId,
        roleId,
        actorUserId,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(assignmentRemoveMock).not.toHaveBeenCalled();
    expect(auditRecordMock).not.toHaveBeenCalled();
  });

  it('should propagate an audit failure during role assignment', async () => {
    auditRecordMock.mockRejectedValue(
      new Error('Audit database unavailable'),
    );

    await expect(
      service.assignRole(
        organizationId,
        membershipId,
        roleId,
        actorUserId,
      ),
    ).rejects.toThrow('Audit database unavailable');

    expect(assignmentSaveMock).toHaveBeenCalledTimes(1);
    expect(auditRecordMock).toHaveBeenCalledTimes(1);
  });

  it('should propagate an audit failure during role removal', async () => {
    assignmentFindOneMock.mockResolvedValue(existingAssignment);

    auditRecordMock.mockRejectedValue(
      new Error('Audit database unavailable'),
    );

    await expect(
      service.removeRole(
        organizationId,
        membershipId,
        roleId,
        actorUserId,
      ),
    ).rejects.toThrow('Audit database unavailable');

    expect(assignmentRemoveMock).toHaveBeenCalledTimes(1);
    expect(auditRecordMock).toHaveBeenCalledTimes(1);
  });

  it('should translate database unique constraint violations into ConflictException', async () => {
    const driverError = Object.assign(
      new Error('Duplicate role assignment'),
      {
        code: '23505',
      },
    );

    const databaseError = new QueryFailedError(
      'INSERT INTO membership_roles',
      [],
      driverError,
    );

    assignmentSaveMock.mockRejectedValue(databaseError);

    await expect(
      service.assignRole(
        organizationId,
        membershipId,
        roleId,
        actorUserId,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
