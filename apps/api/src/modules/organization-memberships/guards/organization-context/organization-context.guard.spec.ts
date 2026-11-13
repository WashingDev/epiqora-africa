import {
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';

import {
  BadRequestException,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';

import { OrganizationMembership } from '../../entities/organization-membership.entity';
import { OrganizationMembershipsService } from '../../organization-memberships.service';
import { OrganizationContextGuard } from './organization-context.guard';

describe('OrganizationContextGuard', () => {
  let guard: OrganizationContextGuard;

  const findActiveMembershipMock = jest.fn(
    async (
      _organizationId: string,
      _keycloakUserId: string,
    ): Promise<OrganizationMembership | null> => null,
  );

  const membershipsService = {
    findActiveMembership: findActiveMembershipMock,
  };

  const organizationId = '550e8400-e29b-41d4-a716-446655440000';

  const createExecutionContext = (request: Record<string, unknown>) =>
    ({
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    }) as ExecutionContext;

  beforeEach(() => {
    jest.clearAllMocks();

    guard = new OrganizationContextGuard(
      membershipsService as unknown as OrganizationMembershipsService,
    );
  });

  it('should allow an active member in an active organization', async () => {
    const membership = {
      id: 'membership-1',
      organizationId,
    } as OrganizationMembership;

    findActiveMembershipMock.mockResolvedValue(membership);

    const request = {
      user: { id: 'user-1' },
      headers: { 'x-organization-id': organizationId },
    };

    const result = await guard.canActivate(
      createExecutionContext(request),
    );

    expect(result).toBe(true);

    expect(request).toHaveProperty('organizationContext', {
      organizationId,
      membershipId: 'membership-1',
    });

    expect(findActiveMembershipMock).toHaveBeenCalledWith(
      organizationId,
      'user-1',
    );
  });

  it('should reject a request without an authenticated user', async () => {
    const request = {
      headers: { 'x-organization-id': organizationId },
    };

    await expect(
      guard.canActivate(createExecutionContext(request)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('should reject a request without an organization header', async () => {
    const request = {
      user: { id: 'user-1' },
      headers: {},
    };

    await expect(
      guard.canActivate(createExecutionContext(request)),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('should reject multiple organization header values', async () => {
    const request = {
      user: { id: 'user-1' },
      headers: {
        'x-organization-id': [
          organizationId,
          'another-organization-id',
        ],
      },
    };

    await expect(
      guard.canActivate(createExecutionContext(request)),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(findActiveMembershipMock).not.toHaveBeenCalled();
  });

  it('should reject an invalid organization UUID', async () => {
    const request = {
      user: { id: 'user-1' },
      headers: { 'x-organization-id': 'invalid-id' },
    };

    await expect(
      guard.canActivate(createExecutionContext(request)),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(findActiveMembershipMock).not.toHaveBeenCalled();
  });

  it('should reject a user without an active organization membership', async () => {
    findActiveMembershipMock.mockResolvedValue(null);

    const request = {
      user: { id: 'user-1' },
      headers: { 'x-organization-id': organizationId },
    };

    await expect(
      guard.canActivate(createExecutionContext(request)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('should reject a user attempting to access another organization without membership', async () => {
    const organizationAId =
      '550e8400-e29b-41d4-a716-446655440000';

    const organizationBId =
      '660e8400-e29b-41d4-a716-446655440000';

    findActiveMembershipMock.mockResolvedValue(null);

    const request = {
      user: { id: 'user-1' },
      headers: {
        'x-organization-id': organizationBId,
      },
    };

    await expect(
      guard.canActivate(createExecutionContext(request)),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(findActiveMembershipMock).toHaveBeenCalledWith(
      organizationBId,
      'user-1',
    );

    expect(request).not.toHaveProperty('organizationContext');
    expect(organizationAId).not.toBe(organizationBId);
  });
  it('should propagate database errors without converting them into authorization errors', async () => {
    const databaseError = new Error('Database connection failed');

    findActiveMembershipMock.mockRejectedValue(databaseError);

    const request = {
      user: { id: 'user-1' },
      headers: { 'x-organization-id': organizationId },
    };

    await expect(
      guard.canActivate(createExecutionContext(request)),
    ).rejects.toBe(databaseError);
  });
});
