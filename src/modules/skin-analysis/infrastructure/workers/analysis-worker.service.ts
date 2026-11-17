import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { SkinAnalysisService } from '../../application/use-case/skin-analysis.service.js';
import {
  PROCESS_ANALYSIS_JOB,
  SKIN_ANALYSIS_QUEUE,
} from '../adapters/bullmq-analysis-work-queue.adapter.js';

@Injectable()
export class AnalysisWorker
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(AnalysisWorker.name);
  private readonly redisUrl: string;
  private readonly concurrency: number;
  private connection: Redis | undefined;
  private worker: Worker<{ outboxId: string }> | undefined;

  constructor(
    private readonly analysis: SkinAnalysisService,
    config: ConfigService,
  ) {
    this.redisUrl = config.getOrThrow<string>('GLOWNSCAN_REDIS_URL');
    this.concurrency = positiveInt(
      config,
      'GLOWNSCAN_ANALYSIS_WORKER_CONCURRENCY',
      3,
    );
  }

  onApplicationBootstrap(): void {
    if (process.env.GLOWNSCAN_ANALYSIS_WORKER_ENABLED !== 'true') return;
    this.connection = new Redis(this.redisUrl, { maxRetriesPerRequest: null });
    this.worker = new Worker<{ outboxId: string }>(
      SKIN_ANALYSIS_QUEUE,
      async (job) => {
        if (job.name !== PROCESS_ANALYSIS_JOB)
          throw new Error(`Unsupported analysis job: ${job.name}`);
        this.logger.log(
          JSON.stringify({
            event: 'analysis_job_started',
            jobId: job.id,
            outboxId: job.data.outboxId,
            attemptNumber: job.attemptsMade + 1,
            maxAttempts: job.opts.attempts ?? 6,
            queueName: job.queueName,
          }),
        );
        await this.analysis.processOutboxEvent(
          job.data.outboxId,
          job.attemptsMade + 1,
          job.opts.attempts ?? 6,
        );
        this.logger.log(
          JSON.stringify({
            event: 'analysis_job_completed',
            jobId: job.id,
            outboxId: job.data.outboxId,
            attemptNumber: job.attemptsMade + 1,
          }),
        );
      },
      { connection: this.connection, concurrency: this.concurrency },
    );
    this.worker.on('failed', (job, error) => {
      this.logger.error(
        JSON.stringify({
          event: 'analysis_job_failed',
          jobId: job?.id ?? 'unknown',
          outboxId: job?.data.outboxId,
          attemptNumber: job ? job.attemptsMade : undefined,
          maxAttempts: job?.opts.attempts ?? 6,
          willRetry: Boolean(
            job && job.attemptsMade < (job.opts.attempts ?? 6),
          ),
          errorName: error.name,
          errorCode:
            'code' in error && typeof error.code === 'string'
              ? error.code
              : undefined,
          errorMessage: error.message,
          stack: error.stack,
        }),
      );
    });
    this.logger.log('Skin-analysis background worker is ready.');
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
    await this.connection?.quit();
  }
}

function positiveInt(
  config: ConfigService,
  name: string,
  fallback: number,
): number {
  const value = Number(config.get<string>(name, String(fallback)));
  if (!Number.isInteger(value) || value < 1)
    throw new Error(`${name} must be a positive integer.`);
  return value;
}
