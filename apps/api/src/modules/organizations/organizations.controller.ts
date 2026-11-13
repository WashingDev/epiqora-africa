import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';
import {
  OrganizationContextGuard,
  type OrganizationRequestContext,
} from '../organization-memberships/guards/organization-context/organization-context.guard';
import { OrganizationMembershipsService } from '../organization-memberships/organization-memberships.service';
import { PermissionsGuard } from '../roles/guards/permissions/permissions.guard';
import { RequirePermissions } from '../roles/decorators/require-permissions.decorator';
import { RolesService } from '../roles/services/roles/roles.service';
import { MembershipRolesService } from '../roles/services/membership-roles/membership-roles.service';
import { AssignRoleDto } from '../roles/dto/assign-role.dto';

interface AuthenticatedOrganizationRequest {
  user: {
    id: string;
  };
  organizationContext: OrganizationRequestContext;
}

@Controller('organizations')
@UseGuards(JwtAuthGuard)
export class OrganizationsController {
  constructor(
    private readonly rolesService: RolesService,
    private readonly membershipRolesService: MembershipRolesService,
    private readonly organizationMembershipsService: OrganizationMembershipsService,
  ) {}

  @Get('auth-check')
  checkAuthentication(
    @Req() request: { user: { id: string } },
  ) {
    return {
      authenticated: true,
      userId: request.user.id,
      message: 'Epiqora API authentication successful.',
    };
  }

  @Get('context')
  @UseGuards(OrganizationContextGuard)
  getOrganizationContext(
    @Req() request: AuthenticatedOrganizationRequest,
  ) {
    return {
      authenticated: true,
      organizationId: request.organizationContext.organizationId,
      membershipId: request.organizationContext.membershipId,
      message: 'Organization context successfully verified.',
    };
  }

  @Get('roles')
  @UseGuards(OrganizationContextGuard, PermissionsGuard)
  @RequirePermissions('roles.read')
  findAvailableRoles(
    @Req() request: AuthenticatedOrganizationRequest,
  ) {
    return this.rolesService.findAvailableRoles(
      request.organizationContext.organizationId,
    );
  }

  @Get('memberships')
  @UseGuards(OrganizationContextGuard, PermissionsGuard)
  @RequirePermissions('memberships.read')
  findOrganizationMemberships(
    @Req() request: AuthenticatedOrganizationRequest,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.organizationMembershipsService.findOrganizationMemberships(
      request.organizationContext.organizationId,
      page,
      limit,
    );
  }

  @Post('memberships/:membershipId/roles')
  @UseGuards(OrganizationContextGuard, PermissionsGuard)
  @RequirePermissions('roles.assign')
  async assignRole(
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @Body() dto: AssignRoleDto,
    @Req() request: AuthenticatedOrganizationRequest,
  ) {
    const assignment = await this.membershipRolesService.assignRole(
      request.organizationContext.organizationId,
      membershipId,
      dto.roleId,
      request.user.id,
    );

    return {
      id: assignment.id,
      organizationId: assignment.organizationId,
      membershipId: assignment.membershipId,
      roleId: assignment.roleId,
      assignedAt: assignment.assignedAt,
    };
  }

  @Delete('memberships/:membershipId/roles/:roleId')
  @UseGuards(OrganizationContextGuard, PermissionsGuard)
  @RequirePermissions('roles.assign')
  async removeRole(
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @Param('roleId', ParseUUIDPipe) roleId: string,
    @Req() request: AuthenticatedOrganizationRequest,
  ) {
    await this.membershipRolesService.removeRole(
      request.organizationContext.organizationId,
      membershipId,
      roleId,
      request.user.id,
    );

    return {
      message: 'Role assignment removed successfully.',
    };
  }
}
