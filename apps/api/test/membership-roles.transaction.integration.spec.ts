import 'reflect-metadata';

import { ForbiddenException, NotFoundException } from '@nestjs/common';

import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';

import { Organization } from '../src/modules/organizations/entities/organization.entity';
import { OrganizationMembership } from '../src/modules/organization-memberships/entities/organization-membership.entity';
import { MembershipStatus } from '../src/modules/organization-memberships/enums/membership-status.enum';
import { Role } from '../src/modules/roles/entities/role.entity';
import { MembershipRole } from '../src/modules/roles/entities/membership-role.entity';
import { Permission } from '../src/modules/roles/entities/permission.entity';
import { RolePermission } from '../src/modules/roles/entities/role-permission.entity';
import { AuditLog } from '../src/modules/audit-logs/entities/audit-log.entity';

import { MembershipRolesService } from '../src/modules/roles/services/membership-roles/membership-roles.service';
import { AuditLogsService } from '../src/modules/audit-logs/audit-logs.service';
import { RolesService } from '../src/modules/roles/services/roles/roles.service';

config({ path: '.env' });

// Integration tests use an explicitly configured, hardcoded test database.
// Never derive the target database from the development DB_DATABASE setting.
const INTEGRATION_TEST_DATABASE = 'outbreakwatch_test';
if (process.env.DB_DATABASE !== INTEGRATION_TEST_DATABASE) {
  throw new Error(
    'SAFETY CHECK FAILED: Integration tests may only use outbreakwatch_test.',
  );
}

const requiredVariables = [
  'DB_HOST',
  'DB_PORT',
  'DB_USERNAME',
  'DB_PASSWORD',
];

for (const variable of requiredVariables) {
  if (!process.env[variable]) {
    throw new Error(`Missing required database variable: ${variable}`);
  }
}

const testDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: INTEGRATION_TEST_DATABASE,
  uuidExtension: 'pgcrypto',
  entities: [
    Organization,
    OrganizationMembership,
    Role,
    Permission,
    MembershipRole,
    RolePermission,
    AuditLog,
  ],
  synchronize: false,
  migrationsRun: false,
  logging: false,
});

const auditFailureTrigger = `
  CREATE OR REPLACE FUNCTION test_reject_role_audit_insert()
  RETURNS TRIGGER AS $$
  BEGIN
    IF NEW.action IN ('ROLE_ASSIGNED', 'ROLE_REMOVED') THEN
      RAISE EXCEPTION 'Intentional integration-test audit failure'
        USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;

  CREATE TRIGGER "TRG_test_reject_role_audit_insert"
  BEFORE INSERT ON "audit_logs"
  FOR EACH ROW
  EXECUTE FUNCTION test_reject_role_audit_insert();
`;

async function removeAuditFailureTrigger(): Promise<void> {
  if (!testDataSource.isInitialized) {
    return;
  }

  await testDataSource.query(`
    DROP TRIGGER IF EXISTS "TRG_test_reject_role_audit_insert"
    ON "audit_logs"
  `);

  await testDataSource.query(`
    DROP FUNCTION IF EXISTS test_reject_role_audit_insert()
  `);
}

async function createFixture() {
  const organizationId = randomUUID();

  const organizationRepository =
    testDataSource.getRepository(Organization);

  const membershipRepository =
    testDataSource.getRepository(OrganizationMembership);

  const roleRepository = testDataSource.getRepository(Role);

  const organization = await organizationRepository.save(
    organizationRepository.create({
      name: `Transaction Test ${organizationId.slice(0, 8)}`,
      code: `TX-${organizationId.slice(0, 8)}`,
      organizationType: 'HEALTH_FACILITY',
      isActive: true,
    }),
  );

  const membership = await membershipRepository.save(
    membershipRepository.create({
      organizationId: organization.id,
      keycloakUserId: `integration-user-${randomUUID()}`,
      status: MembershipStatus.ACTIVE,
      joinedAt: new Date(),
    }),
  );

  const role = await roleRepository.findOne({
    where: {
      code: 'INSTITUTION_ADMIN',
      isSystemRole: true,
      isActive: true,
    },
  });

  if (!role) {
    throw new Error('Seeded INSTITUTION_ADMIN role was not found.');
  }

  return {
    organizationId: organization.id,
    membershipId: membership.id,
    roleId: role.id,
    actorUserId: `integration-actor-${randomUUID()}`,
  };
}

describe('Membership role PostgreSQL transaction integration', () => {
  let service: MembershipRolesService;

  beforeAll(async () => {
    await testDataSource.initialize();

    const [{ current_database: databaseName }] =
      await testDataSource.query('SELECT current_database()');

    if (databaseName !== 'outbreakwatch_test') {
      throw new Error(
        `Connected to unexpected database: ${databaseName}`,
      );
    }

    const migrationRows = await testDataSource.query(
      'SELECT COUNT(*)::int AS count FROM typeorm_migrations',
    );

    if (migrationRows[0].count !== 6) {
      throw new Error(
        'Expected all six database migrations before integration tests.',
      );
    }

    service = new MembershipRolesService(
      testDataSource,
      new AuditLogsService(),
    );
  });

  afterAll(async () => {
    await removeAuditFailureTrigger();

    if (testDataSource.isInitialized) {
      await testDataSource.destroy();
    }
  });

  afterEach(async () => {
    await removeAuditFailureTrigger();
  });

  it('commits a role assignment and its audit record together', async () => {
    const fixture = await createFixture();

    const assignment = await service.assignRole(
      fixture.organizationId,
      fixture.membershipId,
      fixture.roleId,
      fixture.actorUserId,
    );

    const storedAssignment =
      await testDataSource.getRepository(MembershipRole).findOneBy({
        id: assignment.id,
      });

    const auditRecord =
      await testDataSource.getRepository(AuditLog).findOneBy({
        organizationId: fixture.organizationId,
        action: 'ROLE_ASSIGNED',
        targetId: assignment.id,
      });

    expect(storedAssignment).not.toBeNull();

    expect(auditRecord).not.toBeNull();
    expect(auditRecord).toMatchObject({
      organizationId: fixture.organizationId,
      actorUserId: fixture.actorUserId,
      action: 'ROLE_ASSIGNED',
      targetType: 'MEMBERSHIP_ROLE',
      targetId: assignment.id,
      metadata: {
        membershipId: fixture.membershipId,
        roleId: fixture.roleId,
      },
    });
  });

  it('rolls back a role assignment when its audit insert fails', async () => {
    const fixture = await createFixture();

    await testDataSource.query(auditFailureTrigger);

    await expect(
      service.assignRole(
        fixture.organizationId,
        fixture.membershipId,
        fixture.roleId,
        fixture.actorUserId,
      ),
    ).rejects.toThrow();

    const assignments = await testDataSource
      .getRepository(MembershipRole)
      .countBy({
        organizationId: fixture.organizationId,
        membershipId: fixture.membershipId,
        roleId: fixture.roleId,
      });

    const auditRecords = await testDataSource
      .getRepository(AuditLog)
      .countBy({
        organizationId: fixture.organizationId,
        action: 'ROLE_ASSIGNED',
      });

    expect(assignments).toBe(0);
    expect(auditRecords).toBe(0);
  });

  it('commits a role removal and its audit record together', async () => {
    const fixture = await createFixture();

    const assignment = await service.assignRole(
      fixture.organizationId,
      fixture.membershipId,
      fixture.roleId,
      fixture.actorUserId,
    );

    await service.removeRole(
      fixture.organizationId,
      fixture.membershipId,
      fixture.roleId,
      fixture.actorUserId,
    );

    const storedAssignment =
      await testDataSource.getRepository(MembershipRole).findOneBy({
        id: assignment.id,
      });

    const removalAudit = await testDataSource
      .getRepository(AuditLog)
      .findOneBy({
        organizationId: fixture.organizationId,
        action: 'ROLE_REMOVED',
        targetId: assignment.id,
      });

    expect(storedAssignment).toBeNull();

    expect(removalAudit).not.toBeNull();
    expect(removalAudit).toMatchObject({
      organizationId: fixture.organizationId,
      actorUserId: fixture.actorUserId,
      action: 'ROLE_REMOVED',
      targetType: 'MEMBERSHIP_ROLE',
      targetId: assignment.id,
      metadata: {
        membershipId: fixture.membershipId,
        roleId: fixture.roleId,
      },
    });
  });

  it('preserves a role assignment when its removal audit insert fails', async () => {
    const fixture = await createFixture();

    const assignment = await service.assignRole(
      fixture.organizationId,
      fixture.membershipId,
      fixture.roleId,
      fixture.actorUserId,
    );

    await testDataSource.query(auditFailureTrigger);

    await expect(
      service.removeRole(
        fixture.organizationId,
        fixture.membershipId,
        fixture.roleId,
        fixture.actorUserId,
      ),
    ).rejects.toThrow();

    const storedAssignment =
      await testDataSource.getRepository(MembershipRole).findOneBy({
        id: assignment.id,
      });

    const removalAudit = await testDataSource
      .getRepository(AuditLog)
      .findOneBy({
        organizationId: fixture.organizationId,
        action: 'ROLE_REMOVED',
        targetId: assignment.id,
      });

    expect(storedAssignment).not.toBeNull();
    expect(removalAudit).toBeNull();
  });
  it.each([
    MembershipStatus.INVITED,
    MembershipStatus.SUSPENDED,
    MembershipStatus.REVOKED,
  ])('rejects role assignment to a %s membership', async (status) => {
    const fixture = await createFixture();

    await testDataSource
      .getRepository(OrganizationMembership)
      .update(
        {
          id: fixture.membershipId,
          organizationId: fixture.organizationId,
        },
        { status },
      );

    await expect(
      service.assignRole(
        fixture.organizationId,
        fixture.membershipId,
        fixture.roleId,
        fixture.actorUserId,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const assignments = await testDataSource
      .getRepository(MembershipRole)
      .countBy({
        organizationId: fixture.organizationId,
        membershipId: fixture.membershipId,
        roleId: fixture.roleId,
      });

    const auditRecords = await testDataSource
      .getRepository(AuditLog)
      .countBy({
        organizationId: fixture.organizationId,
        action: 'ROLE_ASSIGNED',
      });

    expect(assignments).toBe(0);
    expect(auditRecords).toBe(0);
  });

  it('rejects role assignment when the organization is inactive', async () => {
    const fixture = await createFixture();

    await testDataSource
      .getRepository(Organization)
      .update(
        { id: fixture.organizationId },
        { isActive: false },
      );

    await expect(
      service.assignRole(
        fixture.organizationId,
        fixture.membershipId,
        fixture.roleId,
        fixture.actorUserId,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    const assignments = await testDataSource
      .getRepository(MembershipRole)
      .countBy({
        organizationId: fixture.organizationId,
        membershipId: fixture.membershipId,
        roleId: fixture.roleId,
      });

    const auditRecords = await testDataSource
      .getRepository(AuditLog)
      .countBy({
        organizationId: fixture.organizationId,
        action: 'ROLE_ASSIGNED',
      });

    expect(assignments).toBe(0);
    expect(auditRecords).toBe(0);
  });
  it('prevents Organization A from assigning a role to Organization B membership', async () => {
    const organizationA = await createFixture();
    const organizationB = await createFixture();

    await expect(
      service.assignRole(
        organizationA.organizationId,
        organizationB.membershipId,
        organizationB.roleId,
        organizationA.actorUserId,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    const assignments = await testDataSource
      .getRepository(MembershipRole)
      .countBy({
        organizationId: organizationB.organizationId,
        membershipId: organizationB.membershipId,
        roleId: organizationB.roleId,
      });

    const auditRecordsA = await testDataSource
      .getRepository(AuditLog)
      .countBy({
        organizationId: organizationA.organizationId,
        action: 'ROLE_ASSIGNED',
      });

    const auditRecordsB = await testDataSource
      .getRepository(AuditLog)
      .countBy({
        organizationId: organizationB.organizationId,
        action: 'ROLE_ASSIGNED',
      });

    expect(assignments).toBe(0);
    expect(auditRecordsA).toBe(0);
    expect(auditRecordsB).toBe(0);
  });

  it('prevents Organization A from removing Organization B role assignment', async () => {
    const organizationA = await createFixture();
    const organizationB = await createFixture();

    const assignment = await service.assignRole(
      organizationB.organizationId,
      organizationB.membershipId,
      organizationB.roleId,
      organizationB.actorUserId,
    );

    await expect(
      service.removeRole(
        organizationA.organizationId,
        organizationB.membershipId,
        organizationB.roleId,
        organizationA.actorUserId,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    const storedAssignment =
      await testDataSource.getRepository(MembershipRole).findOneBy({
        id: assignment.id,
        organizationId: organizationB.organizationId,
      });

    const removalAuditA = await testDataSource
      .getRepository(AuditLog)
      .countBy({
        organizationId: organizationA.organizationId,
        action: 'ROLE_REMOVED',
      });

    const removalAuditB = await testDataSource
      .getRepository(AuditLog)
      .countBy({
        organizationId: organizationB.organizationId,
        action: 'ROLE_REMOVED',
      });

    expect(storedAssignment).not.toBeNull();
    expect(removalAuditA).toBe(0);
    expect(removalAuditB).toBe(0);
  });

  it('rejects assigning an Organization B custom role to an Organization A membership', async () => {
    const organizationA = await createFixture();
    const organizationB = await createFixture();

    const roleRepository = testDataSource.getRepository(Role);

    const organizationBRole = await roleRepository.save(
      roleRepository.create({
        organizationId: organizationB.organizationId,
        name: 'Organization B Custom Role',
        code: `ORG_B_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
        description: 'Integration-test custom role',
        isSystemRole: false,
        isActive: true,
      }),
    );

    await expect(
      service.assignRole(
        organizationA.organizationId,
        organizationA.membershipId,
        organizationBRole.id,
        organizationA.actorUserId,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const assignments = await testDataSource
      .getRepository(MembershipRole)
      .countBy({
        organizationId: organizationA.organizationId,
        membershipId: organizationA.membershipId,
        roleId: organizationBRole.id,
      });

    const auditRecords = await testDataSource
      .getRepository(AuditLog)
      .countBy({
        organizationId: organizationA.organizationId,
        action: 'ROLE_ASSIGNED',
      });

    expect(assignments).toBe(0);
    expect(auditRecords).toBe(0);
  });

  it('returns only system and organization-owned roles', async () => {
    const organizationA = await createFixture();
    const organizationB = await createFixture();

    const roleRepository = testDataSource.getRepository(Role);

    const roleA = await roleRepository.save(
      roleRepository.create({
        organizationId: organizationA.organizationId,
        name: 'Organization A Custom Role',
        code: `ORG_A_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
        description: 'Organization A integration-test role',
        isSystemRole: false,
        isActive: true,
      }),
    );

    const roleB = await roleRepository.save(
      roleRepository.create({
        organizationId: organizationB.organizationId,
        name: 'Organization B Custom Role',
        code: `ORG_B_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
        description: 'Organization B integration-test role',
        isSystemRole: false,
        isActive: true,
      }),
    );

    const rolesService = new RolesService(roleRepository);

    const availableToA = await rolesService.findAvailableRoles(
      organizationA.organizationId,
    );

    const availableToB = await rolesService.findAvailableRoles(
      organizationB.organizationId,
    );

    expect(availableToA.some((role) => role.id === organizationA.roleId)).toBe(
      true,
    );
    expect(availableToA.some((role) => role.id === roleA.id)).toBe(true);
    expect(availableToA.some((role) => role.id === roleB.id)).toBe(false);

    expect(availableToB.some((role) => role.id === organizationB.roleId)).toBe(
      true,
    );
    expect(availableToB.some((role) => role.id === roleB.id)).toBe(true);
    expect(availableToB.some((role) => role.id === roleA.id)).toBe(false);
  });

  it('rejects a cross-organization custom-role assignment at the database level', async () => {
    const organizationA = await createFixture();
    const organizationB = await createFixture();

    const roleRepository = testDataSource.getRepository(Role);
    const membershipRoleRepository =
      testDataSource.getRepository(MembershipRole);

    const organizationBRole = await roleRepository.save(
      roleRepository.create({
        organizationId: organizationB.organizationId,
        name: 'Organization B Custom Role',
        code: `ORG_B_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
        description: 'Foreign role for database trigger test',
        isSystemRole: false,
        isActive: true,
      }),
    );

    await expect(
      membershipRoleRepository.save(
        membershipRoleRepository.create({
          organizationId: organizationA.organizationId,
          membershipId: organizationA.membershipId,
          roleId: organizationBRole.id,
        }),
      ),
    ).rejects.toThrow(
      'Custom roles can only be assigned within their own organization',
    );

    const invalidAssignmentCount = await membershipRoleRepository.countBy({
      organizationId: organizationA.organizationId,
      membershipId: organizationA.membershipId,
      roleId: organizationBRole.id,
    });

    expect(invalidAssignmentCount).toBe(0);
  });

  it('prevents audit log records from being updated or deleted', async () => {
    const fixture = await createFixture();

    const assignment = await service.assignRole(
      fixture.organizationId,
      fixture.membershipId,
      fixture.roleId,
      fixture.actorUserId,
    );

    const auditRepository = testDataSource.getRepository(AuditLog);

    const auditRecord = await auditRepository.findOneBy({
      organizationId: fixture.organizationId,
      action: 'ROLE_ASSIGNED',
      targetId: assignment.id,
    });

    expect(auditRecord).not.toBeNull();

    if (!auditRecord) {
      throw new Error('Expected audit record was not created.');
    }

    await expect(
      testDataSource.query(
        'UPDATE audit_logs SET action = $1 WHERE id = $2',
        ['TAMPERED_ACTION', auditRecord.id],
      ),
    ).rejects.toThrow(/Audit log records cannot be updated or deleted/i);

    await expect(
      testDataSource.query(
        'DELETE FROM audit_logs WHERE id = $1',
        [auditRecord.id],
      ),
    ).rejects.toThrow(/Audit log records cannot be updated or deleted/i);

    const preservedAuditRecord = await auditRepository.findOneBy({
      id: auditRecord.id,
    });

    expect(preservedAuditRecord).not.toBeNull();
    expect(preservedAuditRecord).toMatchObject({
      organizationId: fixture.organizationId,
      actorUserId: fixture.actorUserId,
      action: 'ROLE_ASSIGNED',
      targetType: 'MEMBERSHIP_ROLE',
      targetId: assignment.id,
    });
  });
});
