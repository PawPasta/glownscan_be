import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './modules/auth/auth.module.js';
import { ProfileModule } from './modules/profile/profile.module.js';
import { SkinAnalysisModule } from './modules/skin-analysis/skin-analysis.module.js';
import { DatabaseModule } from './shared/database/database.module.js';
import { HealthController } from './shared/database/health.controller.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    DatabaseModule,
    AuthModule,
    ProfileModule,
    SkinAnalysisModule,
  ],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
