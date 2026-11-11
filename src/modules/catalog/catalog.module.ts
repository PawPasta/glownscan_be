import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AdminGuard } from '../../shared/security/admin.guard.js';
import { CatalogService } from './application/catalog.service.js';
import {
  AdminCatalogController,
  CatalogController,
} from './presentation/catalog.controller.js';

@Module({
  imports: [AuthModule],
  controllers: [CatalogController, AdminCatalogController],
  providers: [CatalogService, AdminGuard],
})
export class CatalogModule {}
