import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ANALYSIS_OUTBOX_PORT,
  type AnalysisOutboxPort,
} from '../../application/ports/analysis-outbox.port.js';
import {
  ANALYSIS_WORK_QUEUE_PORT,
  type AnalysisWorkQueuePort,
} from '../../application/ports/analysis-work-queue.port.js';

@Injectable()
export class AnalysisOutboxDispatcher
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(AnalysisOutboxDispatcher.name);
  private timer: NodeJS.Timeout | undefined;
  private dispatching = false;
  private readonly intervalMs: number;

  constructor(
    @Inject(ANALYSIS_OUTBOX_PORT)
    private readonly outbox: AnalysisOutboxPort,
    @Inject(ANALYSIS_WORK_QUEUE_PORT)
    private readonly queue: AnalysisWorkQueuePort,
    config: ConfigService,
  ) {
    this.intervalMs = positiveInt(
      config,
      'GLOWNSCAN_ANALYSIS_OUTBOX_POLL_MS',
      1_000,
    );
  }

  onApplicationBootstrap(): void {
    void this.dispatch();
    this.timer = setInterval(() => void this.dispatch(), this.intervalMs);
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
  }

  async dispatch(): Promise<void> {
    if (this.dispatching) return;
    this.dispatching = true;
    try {
      const messages = await this.outbox.claimAvailable(25);
      for (const message of messages) {
        try {
          await this.queue.publish(message.id);
          await this.outbox.markPublished(message.id);
        } catch (error) {
          await this.outbox.release(message.id);
          this.logger.error(
            `Could not publish analysis outbox event ${message.id}.`,
            error instanceof Error ? error.stack : undefined,
          );
        }
      }
    } finally {
      this.dispatching = false;
    }
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
