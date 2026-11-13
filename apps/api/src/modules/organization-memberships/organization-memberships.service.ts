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
        organization: {
          isActive: true,
        },
      },
      relations: {
        organization: true,
      },
    });
  }

  async findOrganizationMemberships(
    organizationId: string,
    page = 1,
    limit = 20,
  ) {
    const requestedPage =
      Number.isSafeInteger(page) && page >= 1 ? page : 1;

    const safeLimit = Number.isSafeInteger(limit)
      ? Math.min(100, Math.max(1, limit))
      : 20;

    const maximumSafePage =
      Math.floor(Number.MAX_SAFE_INTEGER / safeLimit) + 1;

    const safePage = Math.min(requestedPage, maximumSafePage);

    const [memberships, total] =
      await this.membershipRepository.findAndCount({
        select: {
          id: true,
          organizationId: true,
          status: true,
          joinedAt: true,
          createdAt: true,
        },
        where: {
          organizationId,
        },
        order: {
          createdAt: 'DESC',
        },
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
      });

    return {
      data: memberships,
      total,
      page: safePage,
      limit: safeLimit,
    };
  }
}
