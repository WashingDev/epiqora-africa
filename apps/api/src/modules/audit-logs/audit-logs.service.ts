import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';

import { AuditLog } from './entities/audit-log.entity';

export interface CreateAuditLogInput {
  organizationId: string;
  actorUserId: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata?: Record<string, unknown> | null;
}

@Injectable()
export class AuditLogsService {
  async record(
    input: CreateAuditLogInput,
    manager: EntityManager,
  ): Promise<AuditLog> {
    const repository = manager.getRepository(AuditLog);

    const auditLog = repository.create({
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      metadata: input.metadata ?? null,
    });

    return repository.save(auditLog);
  }
}
