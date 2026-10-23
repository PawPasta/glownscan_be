import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Pool,
  type PoolClient,
  type QueryResult,
  type QueryResultRow,
} from 'pg';

@Injectable()
export class DatabaseService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly pool: Pool;

  constructor(config: ConfigService) {
    const connectionString =
      config.get<string>('GLOWNSCAN_DATABASE_URL') ??
      config.get<string>('DATABASE_URL');
    if (!connectionString) {
      throw new Error('GLOWNSCAN_DATABASE_URL is required.');
    }

    this.pool = new Pool({ connectionString });
    this.pool.on('error', (error: Error) => {
      this.logger.error('Unexpected PostgreSQL pool error.', error.stack);
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      const result = await this.pool.query<{ database: string }>(
        'SELECT current_database() AS database',
      );
      this.logger.log(
        `Connected to PostgreSQL database "${result.rows[0].database}".`,
      );
    } catch (error) {
      this.logger.error(
        'PostgreSQL connection check failed; the application cannot start.',
        error instanceof Error ? error.stack : undefined,
      );
      throw new Error('Failed to connect to PostgreSQL.', { cause: error });
    }
  }

  query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<Row>> {
    return this.pool.query<Row>(text, values);
  }

  async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          'Database transaction failed and rollback also failed.',
          { cause: error },
        );
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
