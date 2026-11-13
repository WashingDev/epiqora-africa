import { InjectRepository } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';

import { MembershipRole } from '../../entities/membership-role.entity';
import { RolePermission } from '../../entities/role-permission.entity';
import { Role } from '../../entities/role.entity';
import { Permission } from '../../entities/permission.entity';
import { OrganizationMembership } from '../../../organization-memberships/entities/organization-membership.entity';
import { MembershipStatus } from '../../../organization-memberships/enums/membership-status.enum';
import { Organization } from '../../../organizations/entities/organization.entity';

@Injectable()
export class EffectivePermissionsService {
  constructor(
    @InjectRepository(MembershipRole)
    private readonly membershipRoleRepository: Repository<MembershipRole>,
  ) {}

  async findEffectivePermissions(
    organizationId: string,
    membershipId: string,
  ): Promise<string[]> {
    const results = await this.membershipRoleRepository
      .createQueryBuilder('membershipRole')
      .innerJoin(
        OrganizationMembership,
        'membership',
        'membership.id = membershipRole.membershipId AND membership.organizationId = membershipRole.organizationId',
      )
      .innerJoin(
        Organization,
        'organization',
        'organization.id = membershipRole.organizationId',
      )
      .innerJoin(
        Role,
        'role',
        'role.id = membershipRole.roleId',
      )
      .innerJoin(
        RolePermission,
        'rolePermission',
        'rolePermission.roleId = membershipRole.roleId',
      )
      .innerJoin(
        Permission,
        'permission',
        'permission.id = rolePermission.permissionId',
      )
      .where('membershipRole.organizationId = :organizationId', {
        organizationId,
      })
      .andWhere('membershipRole.membershipId = :membershipId', {
        membershipId,
      })
      .andWhere('membership.status = :membershipStatus', {
        membershipStatus: MembershipStatus.ACTIVE,
      })
      .andWhere('organization.isActive = :organizationIsActive', {
        organizationIsActive: true,
      })
      .andWhere('role.isActive = :roleIsActive', {
        roleIsActive: true,
      })
      .andWhere('permission.isActive = :permissionIsActive', {
        permissionIsActive: true,
      })
      .andWhere(
        '(role.isSystemRole = TRUE OR role.organizationId = membershipRole.organizationId)',
      )
      .select('permission.code', 'code')
      .distinct(true)
      .getRawMany<{ code: string }>();

    return results.map((permission) => permission.code);
  }
}
