import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Repository } from 'typeorm';

import { Permission } from '../../entities/permission.entity';
import { PermissionsService } from './permissions.service';

describe('PermissionsService', () => {
  let service: PermissionsService;

  const findMock = jest.fn<
    (options?: object) => Promise<Permission[]>
  >();

  const findOneMock = jest.fn<
    (options?: object) => Promise<Permission | null>
  >();

  const permissionRepository = {
    find: findMock,
    findOne: findOneMock,
  } as unknown as Repository<Permission>;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PermissionsService(permissionRepository);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return all active permissions ordered by module and name', async () => {
    const permissions = [
      { id: 'permission-1', code: 'USERS_READ' },
      { id: 'permission-2', code: 'REPORTS_READ' },
    ] as Permission[];

    findMock.mockResolvedValue(permissions);

    const result = await service.findAllActive();

    expect(result).toEqual(permissions);
    expect(findMock).toHaveBeenCalledWith({
      where: { isActive: true },
      order: {
        module: 'ASC',
        name: 'ASC',
      },
    });
  });

  it('should find an active permission by code', async () => {
    const permission = {
      id: 'permission-1',
      code: 'USERS_READ',
      isActive: true,
    } as Permission;

    findOneMock.mockResolvedValue(permission);

    const result = await service.findByCode('USERS_READ');

    expect(result).toEqual(permission);
    expect(findOneMock).toHaveBeenCalledWith({
      where: {
        code: 'USERS_READ',
        isActive: true,
      },
    });
  });

  it('should return null when an active permission is not found', async () => {
    findOneMock.mockResolvedValue(null);

    const result = await service.findByCode('UNKNOWN_PERMISSION');

    expect(result).toBeNull();
  });

  it('should return active permissions belonging to a module', async () => {
    const permissions = [
      { id: 'permission-1', code: 'USERS_READ' },
    ] as Permission[];

    findMock.mockResolvedValue(permissions);

    const result = await service.findByModule('USERS');

    expect(result).toEqual(permissions);
    expect(findMock).toHaveBeenCalledWith({
      where: {
        module: 'USERS',
        isActive: true,
      },
      order: {
        name: 'ASC',
      },
    });
  });
});
