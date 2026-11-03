import {
  Controller,
  Get,
  Req,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';

@Controller('organizations')
@UseGuards(JwtAuthGuard)
export class OrganizationsController {
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
}