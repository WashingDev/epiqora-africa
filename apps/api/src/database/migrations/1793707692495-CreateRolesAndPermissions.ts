
import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRolesAndPermissions1793707692495
  implements MigrationInterface
{
  name = 'CreateRolesAndPermissions1793707692495';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ---------------------------------------------------------
    // 1. ROLES
    // ---------------------------------------------------------

    await queryRunner.query(`
      CREATE TABLE "roles" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "organization_id" uuid,
        "name" character varying(100) NOT NULL,
        "code" character varying(100) NOT NULL,
        "description" text,
        "is_system_role" boolean NOT NULL DEFAULT false,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_c1433d71a4838793a49dcad46ab"
          PRIMARY KEY ("id"),
        CONSTRAINT "CHK_roles_system_organization"
          CHECK (
            (
              "is_system_role" = TRUE
              AND "organization_id" IS NULL
            )
            OR
            (
              "is_system_role" = FALSE
              AND "organization_id" IS NOT NULL
            )
          ),
        CONSTRAINT "FK_c328a1ecd12a5f153a96df4509e"
          FOREIGN KEY ("organization_id")
          REFERENCES "organizations"("id")
          ON DELETE RESTRICT
          ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_roles_system_role"
      ON "roles" ("is_system_role")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_roles_organization_id"
      ON "roles" ("organization_id")
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_roles_system_code"
      ON "roles" ("code")
      WHERE "organization_id" IS NULL
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_roles_organization_code"
      ON "roles" ("organization_id", "code")
      WHERE "organization_id" IS NOT NULL
    `);

    // ---------------------------------------------------------
    // 2. PERMISSIONS
    // ---------------------------------------------------------

    await queryRunner.query(`
      CREATE TABLE "permissions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "code" character varying(120) NOT NULL,
        "name" character varying(100) NOT NULL,
        "module" character varying(80) NOT NULL,
        "description" text,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_920331560282b8bd21bb02290df"
          PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_permissions_module"
      ON "permissions" ("module")
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_permissions_code"
      ON "permissions" ("code")
    `);

    // ---------------------------------------------------------
    // 3. ORGANIZATION MEMBERSHIP COMPOSITE CONSTRAINT
    // ---------------------------------------------------------

    await queryRunner.query(`
      ALTER TABLE "organization_memberships"
      ADD CONSTRAINT "UQ_org_memberships_id_organization"
      UNIQUE ("id", "organization_id")
    `);

    // ---------------------------------------------------------
    // 4. MEMBERSHIP ROLES
    // ---------------------------------------------------------

    await queryRunner.query(`
      CREATE TABLE "membership_roles" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "organization_id" uuid NOT NULL,
        "membership_id" uuid NOT NULL,
        "role_id" uuid NOT NULL,
        "assigned_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_29085525c53a6d0b695d8e0f6ec"
          PRIMARY KEY ("id"),
        CONSTRAINT "FK_e8df62e7452fe48257742398b57"
          FOREIGN KEY ("organization_id")
          REFERENCES "organizations"("id")
          ON DELETE RESTRICT
          ON UPDATE NO ACTION,
        CONSTRAINT "FK_02e6bf34f79053fd01dc8d7fee5"
          FOREIGN KEY ("membership_id", "organization_id")
          REFERENCES "organization_memberships"("id", "organization_id")
          ON DELETE CASCADE
          ON UPDATE NO ACTION,
        CONSTRAINT "FK_c625b47ba8734dafec257d918f7"
          FOREIGN KEY ("role_id")
          REFERENCES "roles"("id")
          ON DELETE RESTRICT
          ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_membership_roles_role_id"
      ON "membership_roles" ("role_id")
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_membership_roles_membership_role"
      ON "membership_roles" ("membership_id", "role_id")
    `);

    // ---------------------------------------------------------
    // 5. ROLE PERMISSIONS
    // ---------------------------------------------------------

    await queryRunner.query(`
      CREATE TABLE "role_permissions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "role_id" uuid NOT NULL,
        "permission_id" uuid NOT NULL,
        "assigned_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_84059017c90bfcb701b8fa42297"
          PRIMARY KEY ("id"),
        CONSTRAINT "FK_178199805b901ccd220ab7740ec"
          FOREIGN KEY ("role_id")
          REFERENCES "roles"("id")
          ON DELETE CASCADE
          ON UPDATE NO ACTION,
        CONSTRAINT "FK_17022daf3f885f7d35423e9971e"
          FOREIGN KEY ("permission_id")
          REFERENCES "permissions"("id")
          ON DELETE RESTRICT
          ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_role_permissions_permission_id"
      ON "role_permissions" ("permission_id")
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_role_permissions_role_permission"
      ON "role_permissions" ("role_id", "permission_id")
    `);

    // ---------------------------------------------------------
    // 6. ROLE OWNERSHIP IMMUTABILITY
    // ---------------------------------------------------------

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION prevent_role_ownership_change()
      RETURNS TRIGGER AS $$
      BEGIN
        IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
           OR NEW.is_system_role IS DISTINCT FROM OLD.is_system_role
        THEN
          RAISE EXCEPTION
            'Role ownership and system classification cannot be changed';
        END IF;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);

    await queryRunner.query(`
      CREATE TRIGGER "TRG_roles_ownership_immutable"
      BEFORE UPDATE OF "organization_id", "is_system_role"
      ON "roles"
      FOR EACH ROW
      EXECUTE FUNCTION prevent_role_ownership_change()
    `);

    // ---------------------------------------------------------
    // 7. MEMBERSHIP-ROLE ORGANIZATION ISOLATION
    // ---------------------------------------------------------

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION enforce_membership_role_organization()
      RETURNS TRIGGER AS $$
      DECLARE
        role_org_id UUID;
        role_is_system BOOLEAN;
      BEGIN
        SELECT "organization_id", "is_system_role"
        INTO role_org_id, role_is_system
        FROM "roles"
        WHERE "id" = NEW.role_id
        FOR KEY SHARE;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'Assigned role does not exist';
        END IF;

        IF role_is_system = FALSE
           AND role_org_id IS DISTINCT FROM NEW.organization_id
        THEN
          RAISE EXCEPTION
            'Custom roles can only be assigned within their own organization';
        END IF;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);

    await queryRunner.query(`
      CREATE TRIGGER "TRG_membership_roles_organization"
      BEFORE INSERT OR UPDATE OF "role_id", "organization_id"
      ON "membership_roles"
      FOR EACH ROW
      EXECUTE FUNCTION enforce_membership_role_organization()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // ---------------------------------------------------------
    // 1. REMOVE MEMBERSHIP-ROLE TRIGGER AND FUNCTION
    // ---------------------------------------------------------

    await queryRunner.query(`
      DROP TRIGGER IF EXISTS "TRG_membership_roles_organization"
      ON "membership_roles"
    `);

    await queryRunner.query(`
      DROP FUNCTION IF EXISTS enforce_membership_role_organization()
    `);

    // ---------------------------------------------------------
    // 2. REMOVE ROLE OWNERSHIP TRIGGER AND FUNCTION
    // ---------------------------------------------------------

    await queryRunner.query(`
      DROP TRIGGER IF EXISTS "TRG_roles_ownership_immutable"
      ON "roles"
    `);

    await queryRunner.query(`
      DROP FUNCTION IF EXISTS prevent_role_ownership_change()
    `);

    // ---------------------------------------------------------
    // 3. DROP ROLE-PERMISSION TABLE
    // ---------------------------------------------------------

    await queryRunner.query(`
      DROP TABLE IF EXISTS "role_permissions"
    `);

    // ---------------------------------------------------------
    // 4. DROP MEMBERSHIP-ROLE TABLE
    // ---------------------------------------------------------

    await queryRunner.query(`
      DROP TABLE IF EXISTS "membership_roles"
    `);

    // ---------------------------------------------------------
    // 5. REMOVE COMPOSITE MEMBERSHIP CONSTRAINT
    // ---------------------------------------------------------

    await queryRunner.query(`
      ALTER TABLE "organization_memberships"
      DROP CONSTRAINT IF EXISTS "UQ_org_memberships_id_organization"
    `);

    await queryRunner.query(`
      DROP TABLE IF EXISTS "permissions"
    `);

    // ---------------------------------------------------------
    // 7. DROP ROLES TABLE
    // ---------------------------------------------------------

    await queryRunner.query(`
      DROP TABLE IF EXISTS "roles"
    `);
  }
}
