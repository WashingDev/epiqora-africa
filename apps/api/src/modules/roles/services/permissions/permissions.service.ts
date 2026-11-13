import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Permission } from '../../entities/permission.entity';

@Injectable()
export class PermissionsService {
  constructor(
    @InjectRepository(Permission)
    private readonly permissionRepository: Repository<Permission>,
  ) {}

  /**
   * Returns all active permissions.
   */
  async findAllActive(): Promise<Permission[]> {
    return this.permissionRepository.find({
      where: { isActive: true },
      order: {
        module: 'ASC',
        name: 'ASC',
      },
    });
  }

  /**
   * Finds an active permission by its unique code.
   */
  async findByCode(code: string): Promise<Permission | null> {
    return this.permissionRepository.findOne({
      where: {
        code,
        isActive: true,
      },
    });
  }

  /**
   * Returns active permissions belonging to a module.
   */
  async findByModule(module: string): Promise<Permission[]> {
    return this.permissionRepository.find({
      where: {
        module,
        isActive: true,
      },
      order: {
        name: 'ASC',
      },
    });
  }
}
