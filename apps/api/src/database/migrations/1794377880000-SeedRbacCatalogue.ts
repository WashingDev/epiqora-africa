import { MigrationInterface, QueryRunner } from 'typeorm';

export class SeedRbacCatalogue1794377880000
  implements MigrationInterface
{
  name = 'SeedRbacCatalogue1794377880000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ---------------------------------------------------------
    // 1. CENTRAL PERMISSION CATALOGUE
    // ---------------------------------------------------------

    await queryRunner.query(`
      INSERT INTO "permissions"
        ("code", "name", "module", "description", "is_active")
      VALUES
        ('organizations.read', 'View Organizations', 'organizations',
         'View authorized organization information.', TRUE),

        ('organizations.manage', 'Manage Organizations', 'organizations',
         'Manage authorized organization settings.', TRUE),

        ('memberships.read', 'View Memberships', 'memberships',
         'View organization membership records.', TRUE),

        ('memberships.manage', 'Manage Memberships', 'memberships',
         'Manage membership invitations and status.', TRUE),

        ('roles.read', 'View Roles', 'roles',
         'View available roles and their permissions.', TRUE),

        ('roles.assign', 'Assign Roles', 'roles',
         'Assign authorized roles to organization memberships.', TRUE),

        ('surveillance.read', 'View Surveillance', 'surveillance',
         'View authorized public health surveillance information.', TRUE),

        ('surveillance.submit', 'Submit Surveillance', 'surveillance',
         'Submit authorized surveillance observations and reports.', TRUE),

        ('intelligence.read', 'View Intelligence', 'intelligence',
         'View authorized public health intelligence.', TRUE),

        ('intelligence.analyze', 'Analyze Intelligence', 'intelligence',
         'Perform authorized public health intelligence analysis.', TRUE),

        ('outbreaks.read', 'View Outbreaks', 'outbreaks',
         'View authorized outbreak information and records.', TRUE),

        ('outbreaks.manage', 'Manage Outbreak Response', 'outbreaks',
         'Manage authorized outbreak response activities.', TRUE),

        ('analytics.read', 'View Analytics', 'analytics',
         'View authorized analytics and reports.', TRUE),

        ('analytics.export', 'Export Analytics', 'analytics',
         'Export authorized analytics and reports.', TRUE),

        ('data_quality.read', 'View Data Quality', 'data_quality',
         'View data quality indicators and findings.', TRUE),

        ('data_quality.review', 'Review Data Quality', 'data_quality',
         'Review and manage authorized data quality findings.', TRUE),

        ('audit_logs.read', 'View Audit Logs', 'auditing',
         'View authorized organization audit records.', TRUE)

      ON CONFLICT ("code") DO NOTHING
    `);

    // ---------------------------------------------------------
    // 2. FOUR CENTRALLY DEFINED SYSTEM ROLES
    // ---------------------------------------------------------

    await queryRunner.query(`
      INSERT INTO "roles"
        (
          "organization_id",
          "name",
          "code",
          "description",
          "is_system_role",
          "is_active"
        )
      VALUES
        (
          NULL,
          'Institution Administrator',
          'INSTITUTION_ADMIN',
          'Manages authorized users, memberships, roles and operations within an institution.',
          TRUE,
          TRUE
        ),
        (
          NULL,
          'Surveillance Officer',
          'SURVEILLANCE_OFFICER',
          'Submits and reviews authorized public health surveillance information.',
          TRUE,
          TRUE
        ),
        (
          NULL,
          'Public Health Analyst',
          'PUBLIC_HEALTH_ANALYST',
          'Accesses and analyzes authorized public health intelligence and analytics.',
          TRUE,
          TRUE
        ),
        (
          NULL,
          'Response Coordinator',
          'RESPONSE_COORDINATOR',
          'Coordinates authorized outbreak response activities.',
          TRUE,
          TRUE
        )

      ON CONFLICT ("code")
      WHERE "organization_id" IS NULL
      DO NOTHING
    `);

    // ---------------------------------------------------------
    // 3. ROLE-PERMISSION ASSIGNMENTS
    // ---------------------------------------------------------

    await queryRunner.query(`
      WITH assignments (role_code, permission_code) AS (
        VALUES

        -- INSTITUTION ADMIN
        ('INSTITUTION_ADMIN', 'organizations.read'),
        ('INSTITUTION_ADMIN', 'organizations.manage'),
        ('INSTITUTION_ADMIN', 'memberships.read'),
        ('INSTITUTION_ADMIN', 'memberships.manage'),
        ('INSTITUTION_ADMIN', 'roles.read'),
        ('INSTITUTION_ADMIN', 'roles.assign'),
        ('INSTITUTION_ADMIN', 'surveillance.read'),
        ('INSTITUTION_ADMIN', 'intelligence.read'),
        ('INSTITUTION_ADMIN', 'outbreaks.read'),
        ('INSTITUTION_ADMIN', 'analytics.read'),
        ('INSTITUTION_ADMIN', 'data_quality.read'),
        ('INSTITUTION_ADMIN', 'audit_logs.read'),

        -- SURVEILLANCE OFFICER
        ('SURVEILLANCE_OFFICER', 'surveillance.read'),
        ('SURVEILLANCE_OFFICER', 'surveillance.submit'),
        ('SURVEILLANCE_OFFICER', 'outbreaks.read'),
        ('SURVEILLANCE_OFFICER', 'data_quality.read'),
        ('SURVEILLANCE_OFFICER', 'data_quality.review'),

        -- PUBLIC HEALTH ANALYST
        ('PUBLIC_HEALTH_ANALYST', 'surveillance.read'),
        ('PUBLIC_HEALTH_ANALYST', 'intelligence.read'),
        ('PUBLIC_HEALTH_ANALYST', 'intelligence.analyze'),
        ('PUBLIC_HEALTH_ANALYST', 'outbreaks.read'),
        ('PUBLIC_HEALTH_ANALYST', 'analytics.read'),
        ('PUBLIC_HEALTH_ANALYST', 'analytics.export'),
        ('PUBLIC_HEALTH_ANALYST', 'data_quality.read'),

        -- RESPONSE COORDINATOR
        ('RESPONSE_COORDINATOR', 'surveillance.read'),
        ('RESPONSE_COORDINATOR', 'intelligence.read'),
        ('RESPONSE_COORDINATOR', 'outbreaks.read'),
        ('RESPONSE_COORDINATOR', 'outbreaks.manage'),
        ('RESPONSE_COORDINATOR', 'analytics.read'),
        ('RESPONSE_COORDINATOR', 'data_quality.read')
      )

      INSERT INTO "role_permissions"
        ("role_id", "permission_id")

      SELECT
        r."id",
        p."id"

      FROM assignments a

      INNER JOIN "roles" r
        ON r."code" = a.role_code
        AND r."organization_id" IS NULL
        AND r."is_system_role" = TRUE

      INNER JOIN "permissions" p
        ON p."code" = a.permission_code
        AND p."is_active" = TRUE

      ON CONFLICT ("role_id", "permission_id")
      DO NOTHING
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // ---------------------------------------------------------
    // INTENTIONALLY NON-DESTRUCTIVE ROLLBACK
    // ---------------------------------------------------------

    // This migration seeds shared authorization reference data.
    // Roles and permissions may be referenced by memberships,
    // other roles, or application workflows after deployment.
    //
    // Automatically deleting these records during rollback could
    // remove pre-existing or actively used authorization data.
    //
    // Therefore, seeded roles and permissions are retained.
    // Any future catalogue cleanup must use a separately reviewed
    // migration with explicit dependency checks.
  }
}
