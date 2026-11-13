import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';

import { Organization } from '../../organizations/entities/organization.entity';
import { MembershipStatus } from '../enums/membership-status.enum';

@Entity({ name: 'organization_memberships' })
@Index(
  'UQ_organization_memberships_org_user',
  ['organizationId', 'keycloakUserId'],
  { unique: true },
)
@Unique(
  'UQ_org_memberships_id_organization',
  ['id', 'organizationId'],
)
export class OrganizationMembership {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId: string;

  @ManyToOne(() => Organization, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ name: 'keycloak_user_id', type: 'varchar', length: 255 })
  keycloakUserId: string;

  @Column({
    type: 'enum',
    enum: MembershipStatus,
    enumName: 'membership_status_enum',
    default: MembershipStatus.INVITED,
  })
  status: MembershipStatus;

  @Column({ name: 'joined_at', type: 'timestamptz', nullable: true })
  joinedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
