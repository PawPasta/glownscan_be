import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import type { Uuid } from '../../../../shared/types/domain.types.js';
import type { AnalysisWorkQueuePort } from '../../application/ports/analysis-work-queue.port.js';

export const SKIN_ANALYSIS_QUEUE = 'skin-analysis';
export const PROCESS_ANALYSIS_JOB = 'process-analysis';

@Injectable()
export class BullMqAnalysisWorkQueueAdapter
  implements AnalysisWorkQueuePort, OnApplicationShutdown
{
  private readonly connection: Redis;
  private readonly queue: Queue;

  constructor(config: ConfigService) {
    this.connection = new Redis(
      config.getOrThrow<string>('GLOWNSCAN_REDIS_URL'),
      { maxRetriesPerRequest: null, lazyConnect: true },
    );
    this.queue = new Queue(SKIN_ANALYSIS_QUEUE, {
      connection: this.connection,
    });
  }

  async publish(outboxId: Uuid): Promise<void> {
    await this.queue.add(
      PROCESS_ANALYSIS_JOB,
      { outboxId },
      {
        jobId: outboxId,
        // Three AI-provider processing attempts plus three cleanup/reconciliation attempts.
        attempts: 6,
        backoff: { type: 'exponential', delay: 1_000 },
        removeOnComplete: { age: 86_400, count: 1_000 },
        removeOnFail: { age: 604_800, count: 5_000 },
      },
    );
  }

  async onApplicationShutdown(): Promise<void> {
    await this.queue.close();
    await this.connection.quit();
  }
}
