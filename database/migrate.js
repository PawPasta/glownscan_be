import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { Client } from 'pg';
import { fileURLToPath } from 'node:url';

const migrationsDirectory = fileURLToPath(
  new URL('./migrations/', import.meta.url),
);
const lockNamespace = 1463864141;
const lockId = 1;

export async function readMigrations() {
  const files = await readdir(migrationsDirectory);
  const migrations = await Promise.all(
    files
      .filter((file) => /^V\d+__[a-z0-9_]+\.sql$/i.test(file))
      .map(async (file) => {
        const [, version, name] = file.match(/^V(\d+)__(.+)\.sql$/i);
        const sql = await readFile(
          new URL(`./migrations/${file}`, import.meta.url),
          'utf8',
        );

        return {
          version,
          name,
          file,
          sql,
          checksum: createHash('sha256').update(sql).digest('hex'),
        };
      }),
  );

  migrations.sort(
    (left, right) => Number(left.version) - Number(right.version),
  );

  for (let index = 1; index < migrations.length; index++) {
    if (
      Number(migrations[index - 1].version) ===
      Number(migrations[index].version)
    ) {
      throw new Error(
        `Duplicate migration version: ${migrations[index].version}`,
      );
    }
  }

  if (migrations.length === 0) {
    throw new Error(`No migration files found in ${migrationsDirectory}`);
  }

  return migrations;
}

async function ensureHistoryTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      version VARCHAR(20) PRIMARY KEY,
      name TEXT NOT NULL,
      checksum CHAR(64) NOT NULL,
      execution_time_ms INTEGER NOT NULL CHECK (execution_time_ms >= 0),
      installed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

function verifyAppliedMigrations(migrations, appliedMigrations) {
  const filesByVersion = new Map(
    migrations.map((migration) => [migration.version, migration]),
  );

  for (const applied of appliedMigrations) {
    const migration = filesByVersion.get(applied.version);

    if (!migration) {
      throw new Error(
        `Migration V${applied.version} is recorded in the database but its file is missing.`,
      );
    }

    if (
      migration.checksum !== applied.checksum ||
      migration.name !== applied.name
    ) {
      throw new Error(
        `Migration V${applied.version} has changed since it was applied. Add a new migration instead of editing it.`,
      );
    }
  }
}

async function runMigrations(client, mode) {
  const migrations = await readMigrations();
  if (mode === 'up') {
    await ensureHistoryTable(client);
  }

  const { rows: historyStatus } = await client.query(
    "SELECT to_regclass('public.schema_migrations') IS NOT NULL AS history_table_exists",
  );
  const appliedMigrations = historyStatus[0].history_table_exists
    ? (
        await client.query(
          'SELECT version, name, checksum FROM public.schema_migrations ORDER BY version',
        )
      ).rows
    : [];
  verifyAppliedMigrations(migrations, appliedMigrations);

  const appliedVersions = new Set(
    appliedMigrations.map(({ version }) => version),
  );

  if (mode === 'status') {
    for (const migration of migrations) {
      console.log(
        `${appliedVersions.has(migration.version) ? 'Applied' : 'Pending'}  V${migration.version}__${migration.name}`,
      );
    }
    return;
  }

  for (const migration of migrations) {
    if (appliedVersions.has(migration.version)) {
      continue;
    }

    const startedAt = performance.now();
    await client.query('BEGIN');
    try {
      await client.query(migration.sql);
      const executionTime = Math.round(performance.now() - startedAt);
      await client.query(
        `INSERT INTO public.schema_migrations (version, name, checksum, execution_time_ms)
         VALUES ($1, $2, $3, $4)`,
        [migration.version, migration.name, migration.checksum, executionTime],
      );
      await client.query('COMMIT');
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          `Migration V${migration.version}__${migration.name} failed and rollback also failed.`,
          { cause: error },
        );
      }
      throw new Error(
        `Failed to apply V${migration.version}__${migration.name}`,
        {
          cause: error,
        },
      );
    }
    console.log(
      `Applied V${migration.version}__${migration.name} (${Math.round(performance.now() - startedAt)} ms)`,
    );
  }
}

async function main() {
  const mode = process.argv[2] ?? 'up';
  if (!['up', 'status'].includes(mode)) {
    throw new Error(`Unknown command "${mode}". Use "up" or "status".`);
  }

  const connectionString =
    process.env.GLOWNSCAN_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'GLOWNSCAN_DATABASE_URL is required. Set it in .env.local, .env, or the process environment.',
    );
  }

  const client = new Client({ connectionString });
  await client.connect();

  let lockAcquired = false;
  try {
    await client.query('SELECT pg_advisory_lock($1, $2)', [
      lockNamespace,
      lockId,
    ]);
    lockAcquired = true;
    await runMigrations(client, mode);
  } finally {
    try {
      if (lockAcquired) {
        await client.query('SELECT pg_advisory_unlock($1, $2)', [
          lockNamespace,
          lockId,
        ]);
      }
    } finally {
      await client.end();
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error('Database migration failed:', error);
    process.exitCode = 1;
  });
}
