import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from '../../../shared/security/admin.guard.js';
import {
  CurrentUser,
  type SecurityContext,
} from '../../../shared/security/security.context.js';
import { JwtAuthGuard } from '../../../shared/security/jwt-auth.guard.js';
import { AdminAccountService } from '../application/use-case/admin-account.service.js';
import {
  AdminAccountQueryDto,
  CreateAdminAccountDto,
  UpdateAdminAccountDto,
} from './admin-account.dto.js';
@ApiTags('admin-accounts')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/accounts')
export class AdminAccountController {
  constructor(private readonly accounts: AdminAccountService) {}
  @Get() list(@Query() query: AdminAccountQueryDto) {
    return this.accounts.list(query.page, query.limit, query.search);
  }
  @Get(':id') get(@Param('id') id: string) {
    return this.accounts.get(id);
  }
  @Post() create(
    @CurrentUser() actor: SecurityContext,
    @Body() body: CreateAdminAccountDto,
  ) {
    return this.accounts.create({
      email: body.email,
      password: body.password,
      fullName: body.fullName,
      roleCodes: body.roleCodes,
      actorId: actor.userId,
    });
  }
  @Patch(':id') update(
    @CurrentUser() actor: SecurityContext,
    @Param('id') id: string,
    @Body() body: UpdateAdminAccountDto,
  ) {
    return this.accounts.update(actor.userId, id, body);
  }
  @Delete(':id') remove(
    @CurrentUser() actor: SecurityContext,
    @Param('id') id: string,
  ) {
    return this.accounts.remove(actor.userId, id);
  }
}
