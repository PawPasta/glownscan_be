import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('database temporal schema conventions', () => {
  const migrationsDirectory = join(process.cwd(), 'database/migrations');
  const sqlFiles = readdirSync(migrationsDirectory).filter((file) =>
    file.endsWith('.sql'),
  );

  it('uses timezone-aware types for persisted instants', () => {
    const legacyTimestampDeclarations = sqlFiles.flatMap((file) => {
      const sql = readFileSync(join(migrationsDirectory, file), 'utf8');
      return [...sql.matchAll(/\bTIMESTAMP\s*(?:WITHOUT TIME ZONE)?\b/gi)].map(
        ([declaration]) => `${file}: ${declaration}`,
      );
    });

    expect(legacyTimestampDeclarations).toEqual([]);
  });

  it('keeps calendar-date fields as DATE rather than timezone instants', () => {
    const declarations = sqlFiles
      .map((file) => readFileSync(join(migrationsDirectory, file), 'utf8'))
      .join('\n');

    expect(declarations).toMatch(/date_of_birth\s+DATE\b/i);
    expect(declarations).toMatch(/usage_date\s+DATE\b/i);
    expect(declarations).toMatch(/check_in_date\s+DATE\b/i);
  });
});
