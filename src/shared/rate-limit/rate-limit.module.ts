import { Global, Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { RateLimitGuard } from './rate-limit.guard.js';
import { RateLimitService } from './rate-limit.service.js';

@Global()
@Module({
  imports: [DatabaseModule],
  providers: [RateLimitService, RateLimitGuard],
  exports: [RateLimitGuard, RateLimitService],
})
export class RateLimitModule {}
