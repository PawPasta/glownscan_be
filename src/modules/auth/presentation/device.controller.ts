import { Body, Controller, Delete, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  type SecurityContext,
} from '../../../shared/security/security.context.js';
import { JwtAuthGuard } from '../../../shared/security/jwt-auth.guard.js';
import { AuthenticationService } from '../application/use-case/authentication.service.js';
import { DeactivateDeviceDto, SyncDeviceDto } from './auth.dto.js';

@ApiTags('devices')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('devices')
export class DeviceController {
  constructor(private readonly authentication: AuthenticationService) {}

  @Put('me')
  sync(@CurrentUser() user: SecurityContext, @Body() body: SyncDeviceDto) {
    return this.authentication.syncDeviceRegistration(user.userId, body);
  }

  @Delete('me')
  async deactivate(
    @CurrentUser() user: SecurityContext,
    @Body() body: DeactivateDeviceDto,
  ) {
    await this.authentication.deactivateDeviceRegistration(
      user.userId,
      body.installationId,
    );
    return { message: 'Device notifications have been disabled.' };
  }
}
