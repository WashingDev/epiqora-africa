import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'audit_logs' })
@Index('IDX_audit_logs_organization_created_at', [
  'organizationId',
  'createdAt',
])
@Index('IDX_audit_logs_actor_user_id', ['actorUserId'])
@Index('IDX_audit_logs_action', ['action'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    name: 'organization_id',
    type: 'uuid',
  })
  organizationId: string;

  @Column({
    name: 'actor_user_id',
    type: 'varchar',
    length: 255,
  })
  actorUserId: string;

  @Column({
    type: 'varchar',
    length: 100,
  })
  action: string;

  @Column({
    name: 'target_type',
    type: 'varchar',
    length: 100,
  })
  targetType: string;

  @Column({
    name: 'target_id',
    type: 'varchar',
    length: 255,
  })
  targetId: string;

  @Column({
    type: 'jsonb',
    nullable: true,
  })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt: Date;
}
