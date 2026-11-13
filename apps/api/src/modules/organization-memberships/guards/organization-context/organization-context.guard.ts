import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { OrganizationMembershipsService } from '../../organization-memberships.service';

interface AuthenticatedUser {
  id: string;
}

export interface OrganizationRequestContext {
  organizationId: string;
  membershipId: string;
}

interface OrganizationContextRequest {
  headers: Record<string, string | string[] | undefined>;
  user?: AuthenticatedUser;
  organizationContext?: OrganizationRequestContext;
}

@Injectable()
export class OrganizationContextGuard implements CanActivate {
  constructor(
    private readonly membershipsService: OrganizationMembershipsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request =
      context.switchToHttp().getRequest<OrganizationContextRequest>();

    // Authentication must happen before organization authorization.
    if (!request.user?.id) {
      throw new UnauthorizedException(
        'Authentication is required.',
      );
    }

    const organizationHeader =
      request.headers['x-organization-id'];

    if (
      typeof organizationHeader !== 'string' ||
      !organizationHeader.trim()
    ) {
      throw new BadRequestException(
        'A valid X-Organization-Id header is required.',
      );
    }

    const organizationId = organizationHeader.trim();

    // Organization IDs are UUIDs in the Epiqora database.
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (!uuidRegex.test(organizationId)) {
      throw new BadRequestException(
        'The organization ID must be a valid UUID.',
      );
    }

    const membership =
      await this.membershipsService.findActiveMembership(
        organizationId,
        request.user.id,
      );

    if (!membership) {
      throw new ForbiddenException(
        'You do not have an active membership in this organization.',
      );
    }

    request.organizationContext = {
      organizationId: membership.organizationId,
      membershipId: membership.id,
    };

    return true;
  }
}