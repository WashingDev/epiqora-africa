import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateOrganizationMemberships1793697663381 implements MigrationInterface {
    name = 'CreateOrganizationMemberships1793697663381'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."membership_status_enum" AS ENUM('INVITED', 'ACTIVE', 'SUSPENDED', 'REVOKED')`);
        await queryRunner.query(`CREATE TABLE "organization_memberships" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "organization_id" uuid NOT NULL, "keycloak_user_id" character varying(255) NOT NULL, "status" "public"."membership_status_enum" NOT NULL DEFAULT 'INVITED', "joined_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_cd7be805730a4c778a5f45364af" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_organization_memberships_org_user" ON "organization_memberships"  ("organization_id", "keycloak_user_id") `);
        await queryRunner.query(`ALTER TABLE "organization_memberships" ADD CONSTRAINT "FK_86ae2efbb9ce84dd652e0c96a49" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "organization_memberships" DROP CONSTRAINT "FK_86ae2efbb9ce84dd652e0c96a49"`);
        await queryRunner.query(`DROP INDEX "public"."UQ_organization_memberships_org_user"`);
        await queryRunner.query(`DROP TABLE "organization_memberships"`);
        await queryRunner.query(`DROP TYPE "public"."membership_status_enum"`);
    }

}
