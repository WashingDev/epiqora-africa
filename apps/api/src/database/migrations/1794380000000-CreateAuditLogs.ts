import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAuditLogs1794380000000
  implements MigrationInterface
{
  name = 'CreateAuditLogs1794380000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "audit_logs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "organization_id" uuid NOT NULL,
        "actor_user_id" character varying(255) NOT NULL,
        "action" character varying(100) NOT NULL,
        "target_type" character varying(100) NOT NULL,
        "target_id" character varying(255) NOT NULL,
        "metadata" jsonb,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),

        CONSTRAINT "PK_audit_logs"
          PRIMARY KEY ("id"),

        CONSTRAINT "FK_audit_logs_organization"
          FOREIGN KEY ("organization_id")
          REFERENCES "organizations"("id")
          ON DELETE RESTRICT
          ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_audit_logs_organization_created_at"
      ON "audit_logs" ("organization_id", "created_at")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_audit_logs_actor_user_id"
      ON "audit_logs" ("actor_user_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_audit_logs_action"
      ON "audit_logs" ("action")
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
      RETURNS TRIGGER AS $$
      BEGIN
        RAISE EXCEPTION
          'Audit log records cannot be updated or deleted';
      END;
      $$ LANGUAGE plpgsql
    `);

    await queryRunner.query(`
      CREATE TRIGGER "TRG_audit_logs_immutable"
      BEFORE UPDATE OR DELETE
      ON "audit_logs"
      FOR EACH ROW
      EXECUTE FUNCTION prevent_audit_log_mutation()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS "TRG_audit_logs_immutable"
      ON "audit_logs"
    `);

    await queryRunner.query(`
      DROP FUNCTION IF EXISTS prevent_audit_log_mutation()
    `);

    await queryRunner.query(`
      DROP TABLE IF EXISTS "audit_logs"
    `);
  }
}
