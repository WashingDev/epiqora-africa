import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Role } from '../../entities/role.entity';

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
  ) {}

  /**
   * Returns active system roles and active custom roles
   * belonging to the specified organization.
   *
   * System roles are globally available.
   * Custom roles are restricted to their owning organization.
   */
  async findAvailableRoles(organizationId: string): Promise<Role[]> {
    return this.roleRepository
      .createQueryBuilder('role')
      .where('role.isActive = :isActive', { isActive: true })
      .andWhere(
        `(
          (role.isSystemRole = :systemRole AND role.organizationId IS NULL)
          OR
          (
            role.isSystemRole = :organizationRole
            AND role.organizationId = :organizationId
          )
        )`,
        {
          systemRole: true,
          organizationRole: false,
          organizationId,
        },
      )
      .orderBy('role.isSystemRole', 'DESC')
      .addOrderBy('role.name', 'ASC')
      .getMany();
  }
}
