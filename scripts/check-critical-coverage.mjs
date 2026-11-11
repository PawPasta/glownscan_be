import { readFile } from 'node:fs/promises';

const thresholds = new Map([
  ['authentication.service.ts', 60],
  ['skin-analysis.service.ts', 75],
  ['gemini-generative-model.adapter.ts', 80],
  ['jwt-auth.guard.ts', 90],
]);

const coverage = JSON.parse(
  await readFile(
    new URL('../coverage/coverage-final.json', import.meta.url),
    'utf8',
  ),
);
const failures = [];

for (const [suffix, threshold] of thresholds) {
  const [file, data] = Object.entries(coverage).find(([path]) =>
    path.endsWith(suffix),
  ) ?? [undefined, undefined];
  if (!file || !data) {
    failures.push(`${suffix}: coverage record is missing`);
    continue;
  }
  const counts = Object.values(data.s);
  const percentage =
    (counts.filter((count) => count > 0).length / counts.length) * 100;
  if (percentage < threshold) {
    failures.push(
      `${suffix}: ${percentage.toFixed(1)}% statements is below ${threshold}%`,
    );
  }
}

if (failures.length) {
  throw new Error(
    `Critical coverage threshold failed:\n${failures.join('\n')}`,
  );
}
