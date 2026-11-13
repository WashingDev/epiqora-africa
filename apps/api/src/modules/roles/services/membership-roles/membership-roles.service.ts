import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { QueryFailedError, DataSource } from 'typeorm';

import { MembershipRole } from '../../entities/membership-role.entity';
import { Role } from '../../entities/role.entity';
import { OrganizationMembership } from '../../../organization-memberships/entities/organization-membership.entity';
import { MembershipStatus } from '../../../organization-memberships/enums/membership-status.enum';
import { AuditLogsService } from '../../../audit-logs/audit-logs.service';

@Injectable()
export class MembershipRolesService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  /**
   * Assigns an active role to an active organization membership.
   *
   * System roles may be assigned across organizations.
   * Custom roles may only be assigned within their owning organization.
   *
   * The role assignment and audit event are committed atomically.
   */
  async assignRole(
    organizationId: string,
    membershipId: string,
    roleId: string,
    actorUserId: string,
  ): Promise<MembershipRole> {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const membershipRepository =
          manager.getRepository(OrganizationMembership);

        const roleRepository = manager.getRepository(Role);
        const membershipRoleRepository =
          manager.getRepository(MembershipRole);

        const membership = await membershipRepository.findOne({
          where: {
            id: membershipId,
            organizationId,
            organization: {
              isActive: true,
            },
          },
          lock: {
            mode: 'pessimistic_write',
          },
        });

        if (!membership) {
          throw new NotFoundException(
            'Organization membership was not found.',
          );
        }

        if (membership.status !== MembershipStatus.ACTIVE) {
          throw new ForbiddenException(
            'Roles can only be assigned to active memberships.',
          );
        }

        const role = await roleRepository.findOne({
          where: {
            id: roleId,
            isActive: true,
          },
          lock: {
            mode: 'pessimistic_write',
          },
        });

        if (!role) {
          throw new NotFoundException(
            'Active role was not found.',
          );
        }

        if (
          !role.isSystemRole &&
          role.organizationId !== organizationId
        ) {
          throw new ForbiddenException(
            'This custom role does not belong to the specified organization.',
          );
        }

        const existingAssignment =
          await membershipRoleRepository.findOne({
            where: {
              organizationId,
              membershipId,
              roleId,
            },
          });

        if (existingAssignment) {
          throw new ConflictException(
            'This role is already assigned to the membership.',
          );
        }

        const assignment = membershipRoleRepository.create({
          organizationId,
          membershipId,
          roleId,
        });

        const savedAssignment =
          await membershipRoleRepository.save(assignment);

        await this.auditLogsService.record(
          {
            organizationId,
            actorUserId,
            action: 'ROLE_ASSIGNED',
            targetType: 'MEMBERSHIP_ROLE',
            targetId: savedAssignment.id,
            metadata: {
              membershipId,
              roleId,
            },
          },
          manager,
        );

        return savedAssignment;
      });
    } catch (error: unknown) {
      if (this.isUniqueConstraintViolation(error)) {
        throw new ConflictException(
          'This role is already assigned to the membership.',
        );
      }

      throw error;
    }
  }

  /**
   * Removes a role assignment from a specific organization membership.
   *
   * The deletion and audit event are committed atomically.
   */
  async removeRole(
    organizationId: string,
    membershipId: string,
    roleId: string,
    actorUserId: string,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const membershipRoleRepository =
        manager.getRepository(MembershipRole);

      const assignment = await membershipRoleRepository.findOne({
        where: {
          organizationId,
          membershipId,
          roleId,
        },
        lock: {
          mode: 'pessimistic_write',
        },
      });

      if (!assignment) {
        throw new NotFoundException(
          'The specified role assignment was not found.',
        );
      }

      const assignmentId = assignment.id;

      await membershipRoleRepository.remove(assignment);

      await this.auditLogsService.record(
        {
          organizationId,
          actorUserId,
          action: 'ROLE_REMOVED',
          targetType: 'MEMBERSHIP_ROLE',
          targetId: assignmentId,
          metadata: {
            membershipId,
            roleId,
          },
        },
        manager,
      );
    });
  }

  private isUniqueConstraintViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }

    const driverError = error.driverError as {
      code?: string;
    };

    return driverError.code === '23505';
  }
}
