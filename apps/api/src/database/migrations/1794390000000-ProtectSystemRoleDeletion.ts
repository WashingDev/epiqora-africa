import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProtectSystemRoleDeletion1794390000000
  implements MigrationInterface
{
  name = 'ProtectSystemRoleDeletion1794390000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION prevent_system_role_deletion()
      RETURNS TRIGGER AS $$
      BEGIN
        IF OLD."is_system_role" = TRUE THEN
          RAISE EXCEPTION
            'System roles cannot be deleted';
        END IF;

        RETURN OLD;
      END;
      $$ LANGUAGE plpgsql
    `);

    await queryRunner.query(`
      CREATE TRIGGER "TRG_roles_system_delete_protection"
      BEFORE DELETE
      ON "roles"
      FOR EACH ROW
      EXECUTE FUNCTION prevent_system_role_deletion()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS "TRG_roles_system_delete_protection"
      ON "roles"
    `);

    await queryRunner.query(`
      DROP FUNCTION IF EXISTS prevent_system_role_deletion()
    `);
  }
}
