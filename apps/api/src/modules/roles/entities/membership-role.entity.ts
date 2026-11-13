import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { OrganizationMembership } from '../../organization-memberships/entities/organization-membership.entity';
import { Role } from './role.entity';
import { Organization } from '../../organizations/entities/organization.entity';

@Entity({ name: 'membership_roles' })
@Index(
  'UQ_membership_roles_membership_role',
  ['membershipId', 'roleId'],
  { unique: true },
)
@Index('IDX_membership_roles_role_id', ['roleId'])
export class MembershipRole {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId: string;

  @ManyToOne(() => Organization, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ name: 'membership_id', type: 'uuid' })
  membershipId: string;

  @Column({ name: 'role_id', type: 'uuid' })
  roleId: string;

  @ManyToOne(() => OrganizationMembership, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn([
    { name: 'membership_id', referencedColumnName: 'id' },
    {
      name: 'organization_id',
      referencedColumnName: 'organizationId',
    },
  ])
  membership: OrganizationMembership;

  @ManyToOne(() => Role, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'role_id' })
  role: Role;

  @CreateDateColumn({ name: 'assigned_at', type: 'timestamptz' })
  assignedAt: Date;
}