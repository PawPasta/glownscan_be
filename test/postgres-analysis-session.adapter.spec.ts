import { ConfigService } from '@nestjs/config';
import type { DatabaseService } from '../src/shared/database/database.service.js';
import { PostgresAnalysisSessionAdapter } from '../src/modules/skin-analysis/infrastructure/adapters/postgres-analysis-session.adapter.js';
import { PostgresAnalysisOutboxAdapter } from '../src/modules/skin-analysis/infrastructure/adapters/postgres-analysis-outbox.adapter.js';

describe('PostgresAnalysisSessionAdapter privacy cleanup', () => {
  it('retains a minimal failed session and purges analysis payload tables transactionally', async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1, rows: [] });
    const transaction = vi.fn(
      (callback: (client: { query: typeof query }) => unknown) =>
        callback({ query }),
    );
    const database = {
      transaction,
      query,
    } as unknown as DatabaseService;
    const adapter = new PostgresAnalysisSessionAdapter(
      database,
      new ConfigService({}),
    );

    await adapter.failSessionAndPurgeData(
      'session-1',
      'user-1',
      'ANALYSIS_PROCESSING_FAILED',
    );

    expect(transaction).toHaveBeenCalledOnce();
    expect(query.mock.calls[0]?.[0]).toContain("SET status = 'FAILED'");
    for (const table of [
      'analysis_results',
      'analysis_observations',
      'assessment_snapshots',
      'analysis_consents',
      'analysis_images',
    ]) {
      expect(
        query.mock.calls.some(([sql]) =>
          String(sql).includes(`DELETE FROM app_skin_analysis.${table}`),
        ),
      ).toBe(true);
    }
    expect(query.mock.calls.at(-1)?.[0]).toContain("payload = '{}'::jsonb");
  });
});

describe('PostgresAnalysisOutboxAdapter worker/dispatcher race', () => {
  it('lets a worker read an atomically claimed event while dispatch is finalizing publish status', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const adapter = new PostgresAnalysisOutboxAdapter({ query } as never);

    await adapter.findPublished('outbox-1');

    expect(query.mock.calls[0]?.[0]).toContain(
      "status IN ('PROCESSING', 'PUBLISHED')",
    );
  });
});
