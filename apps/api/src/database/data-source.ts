import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';

import { Organization } from '../modules/organizations/entities/organization.entity';
import { OrganizationMembership } from '../modules/organization-memberships/entities/organization-membership.entity';
import { Role } from '../modules/roles/entities/role.entity';
import { Permission } from '../modules/roles/entities/permission.entity';
import { MembershipRole } from '../modules/roles/entities/membership-role.entity';
import { RolePermission } from '../modules/roles/entities/role-permission.entity';
import { AuditLog } from '../modules/audit-logs/entities/audit-log.entity';

// Load environment variables from apps/api/.env
config({ path: '.env' });

const requiredVariables = [
  'DB_HOST',
  'DB_PORT',
  'DB_USERNAME',
  'DB_PASSWORD',
  'DB_DATABASE',
];

for (const variable of requiredVariables) {
  if (!process.env[variable]) {
    throw new Error(`Missing required environment variable: ${variable}`);
  }
}

export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,

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

  migrations: ['src/database/migrations/*.ts'],

  synchronize: false,
  migrationsRun: false,
  logging: false,
  migrationsTableName: 'typeorm_migrations',
});
