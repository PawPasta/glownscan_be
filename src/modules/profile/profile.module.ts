import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CloudinaryModule } from '../cloudinary/cloudinary.module.js';
import { DatabaseModule } from '../../shared/database/database.module.js';
import { PROFILE_PORT } from './application/ports/profile.port.js';
import { ProfileService } from './application/use-case/profile.service.js';
import { PostgresProfileAdapter } from './infrastructure/adapters/postgres-profile.adapter.js';
import { ProfileController } from './presentation/profile.controller.js';

@Module({
  imports: [DatabaseModule, AuthModule, CloudinaryModule],
  controllers: [ProfileController],
  providers: [
    PostgresProfileAdapter,
    { provide: PROFILE_PORT, useExisting: PostgresProfileAdapter },
    ProfileService,
  ],
})
export class ProfileModule {}
