import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';


import { Permission } from './permission.entity';
import { Role } from './role.entity';


@Entity({ name: 'role_permissions' })
@Index(
  'UQ_role_permissions_role_permission',
  ['roleId', 'permissionId'],
  { unique: true },
)
@Index('IDX_role_permissions_permission_id', ['permissionId'])
export class RolePermission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'role_id', type: 'uuid' })
  roleId: string;

  @ManyToOne(() => Role, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'role_id' })
  role: Role;

  @Column({ name: 'permission_id', type: 'uuid' })
  permissionId: string;

  @ManyToOne(() => Permission, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'permission_id' })
  permission: Permission;

  @CreateDateColumn({ name: 'assigned_at', type: 'timestamptz' })
  assignedAt: Date;
}