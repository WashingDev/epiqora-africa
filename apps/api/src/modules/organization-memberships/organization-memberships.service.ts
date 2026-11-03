import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { OrganizationMembership } from './entities/organization-membership.entity';
import { MembershipStatus } from './enums/membership-status.enum';

@Injectable()
export class OrganizationMembershipsService {
  constructor(
    @InjectRepository(OrganizationMembership)
    private readonly membershipRepository: Repository<OrganizationMembership>,
  ) {}

  async findActiveMembership(
    organizationId: string,
    keycloakUserId: string,
  ): Promise<OrganizationMembership | null> {
    return this.membershipRepository.findOne({
      where: {
        organizationId,
        keycloakUserId,
        status: MembershipStatus.ACTIVE,
      },
      relations: {
        organization: true,
      },
    });
  }
}