
import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { Organization } from '../../organizations/entities/organization.entity';

@Entity({ name: 'roles' })
@Check(
  'CHK_roles_system_organization',
  '("is_system_role" = TRUE AND "organization_id" IS NULL) OR ("is_system_role" = FALSE AND "organization_id" IS NOT NULL)',
)
@Index('IDX_roles_organization_id', ['organizationId'])
@Index('IDX_roles_system_role', ['isSystemRole'])
@Index('UQ_roles_system_code', ['code'], {
  unique: true,
  where: '"organization_id" IS NULL',
})
@Index('UQ_roles_organization_code', ['organizationId', 'code'], {
  unique: true,
  where: '"organization_id" IS NOT NULL',
})
export class Role {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    name: 'organization_id',
    type: 'uuid',
    nullable: true,
  })
  organizationId: string | null;

  @ManyToOne(() => Organization, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization | null;

  @Column({
    type: 'varchar',
    length: 100,
  })
  name: string;

  @Column({
    type: 'varchar',
    length: 100,
  })
  code: string;

  @Column({
    type: 'text',
    nullable: true,
  })
  description: string | null;

  @Column({
    name: 'is_system_role',
    type: 'boolean',
    default: false,
  })
  isSystemRole: boolean;

  @Column({
    name: 'is_active',
    type: 'boolean',
    default: true,
  })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
