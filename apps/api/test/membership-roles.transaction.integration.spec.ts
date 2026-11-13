import 'reflect-metadata';

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

config({ path: '.env' });

if (process.env.DB_DATABASE !== 'outbreakwatch_test') {
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
  database: 'outbreakwatch_test',
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
    if (process.env.DB_DATABASE !== 'outbreakwatch_test') {
      throw new Error('Refusing to run outside outbreakwatch_test.');
    }

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
    expect(auditRecord?.actorUserId).toBe(fixture.actorUserId);
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
    expect(removalAudit?.actorUserId).toBe(fixture.actorUserId);
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
});
