import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { DatabaseService } from './database.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly database: DatabaseService) {}

  @Get('live')
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get(['ready', 'database'])
  async checkDatabase(): Promise<{ status: 'ok'; database: 'connected' }> {
    try {
      await Promise.race([
        this.database.query('SELECT 1'),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Readiness timed out.')), 3_000),
        ),
      ]);
      return { status: 'ok', database: 'connected' };
    } catch (error) {
      throw new ServiceUnavailableException(
        'Database connection unavailable.',
        {
          cause: error,
        },
      );
    }
  }
}
