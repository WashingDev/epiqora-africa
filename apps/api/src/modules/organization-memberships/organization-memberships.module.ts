import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { OrganizationMembership } from './entities/organization-membership.entity';
import { OrganizationMembershipsService } from './organization-memberships.service';

@Module({
  imports: [TypeOrmModule.forFeature([OrganizationMembership])],
  exports: [TypeOrmModule],
  providers: [OrganizationMembershipsService],
})
export class OrganizationMembershipsModule {}