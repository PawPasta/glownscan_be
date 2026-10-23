import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { DatabaseService } from './database.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly database: DatabaseService) {}

  @Get('database')
  async checkDatabase(): Promise<{ status: 'ok'; database: 'connected' }> {
    try {
      await this.database.query('SELECT 1');
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
