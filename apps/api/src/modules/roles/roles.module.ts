import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Role } from './entities/role.entity';
import { Permission } from './entities/permission.entity';
import { MembershipRole } from './entities/membership-role.entity';
import { RolePermission } from './entities/role-permission.entity';

import { RolesService } from './services/roles/roles.service';
import { PermissionsService } from './services/permissions/permissions.service';
import { EffectivePermissionsService } from './services/permissions/effective-permissions.service';
import { MembershipRolesService } from './services/membership-roles/membership-roles.service';

import { PermissionsGuard } from './guards/permissions/permissions.guard';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Role,
      Permission,
      MembershipRole,
      RolePermission,
    ]),
    AuditLogsModule,
  ],
  providers: [
    RolesService,
    PermissionsService,
    EffectivePermissionsService,
    MembershipRolesService,
    PermissionsGuard,
  ],
  exports: [
    TypeOrmModule,
    RolesService,
    PermissionsService,
    EffectivePermissionsService,
    MembershipRolesService,
    PermissionsGuard,
  ],
})
export class RolesModule {}
