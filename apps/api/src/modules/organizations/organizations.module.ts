import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { OrganizationMembershipsModule } from '../organization-memberships/organization-memberships.module';
import { RolesModule } from '../roles/roles.module';

import { Organization } from './entities/organization.entity';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Organization]),
    AuthModule,
    OrganizationMembershipsModule,
    RolesModule,
  ],
  controllers: [OrganizationsController],
  providers: [OrganizationsService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
