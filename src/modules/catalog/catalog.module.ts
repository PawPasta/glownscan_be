import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AdminGuard } from '../../shared/security/admin.guard.js';
import { CatalogService } from './application/use-case/catalog.service.js';
import { DatabaseModule } from '../../shared/database/database.module.js';
import { CATALOG_DATA_PORT } from './application/ports/catalog-data.port.js';
import { PostgresCatalogAdapter } from './infrastructure/adapters/postgres-catalog.adapter.js';
import {
  AdminCatalogController,
  CatalogController,
} from './presentation/catalog.controller.js';

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [CatalogController, AdminCatalogController],
  providers: [
    CatalogService,
    AdminGuard,
    PostgresCatalogAdapter,
    { provide: CATALOG_DATA_PORT, useExisting: PostgresCatalogAdapter },
  ],
})
export class CatalogModule {}
