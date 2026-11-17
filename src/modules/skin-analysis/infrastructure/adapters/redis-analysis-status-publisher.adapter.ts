import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import type {
  AnalysisStatusPublisherPort,
  AnalysisStatusEvent,
} from '../../application/ports/analysis-status-publisher.port.js';

export const ANALYSIS_STATUS_CHANNEL = 'glownscan:analysis-status:v1';

@Injectable()
export class RedisAnalysisStatusPublisherAdapter
  implements AnalysisStatusPublisherPort, OnApplicationShutdown
{
  private readonly connection: Redis;

  constructor(config: ConfigService) {
    this.connection = new Redis(
      config.getOrThrow<string>('GLOWNSCAN_REDIS_URL'),
      {
        lazyConnect: true,
        maxRetriesPerRequest: 2,
      },
    );
  }

  async publish(event: AnalysisStatusEvent): Promise<void> {
    await this.connection.publish(
      ANALYSIS_STATUS_CHANNEL,
      JSON.stringify(event),
    );
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.connection.status !== 'end') await this.connection.quit();
  }
}
