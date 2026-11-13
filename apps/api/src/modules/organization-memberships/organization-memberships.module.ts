import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { OrganizationMembership } from './entities/organization-membership.entity';
import { OrganizationMembershipsService } from './organization-memberships.service';
import { OrganizationContextGuard } from './guards/organization-context/organization-context.guard';

@Module({
  imports: [TypeOrmModule.forFeature([OrganizationMembership])],
  providers: [
    OrganizationMembershipsService,
    OrganizationContextGuard,
  ],
  exports: [
    TypeOrmModule,
    OrganizationMembershipsService,
    OrganizationContextGuard,
  ],
})
export class OrganizationMembershipsModule {}