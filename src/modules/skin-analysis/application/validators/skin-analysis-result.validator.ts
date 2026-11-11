import { UnprocessableEntityException } from '../../../../shared/handler/http.exceptions.js';
import type { SkinAnalysisResult } from '../types/skin-analysis-result.js';

export function parseSkinAnalysisResult(text: string): SkinAnalysisResult {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new UnprocessableEntityException(
      'Gemini returned invalid JSON for the skin analysis.',
    );
  }
  if (!isSkinAnalysisResult(value)) {
    throw new UnprocessableEntityException(
      'Gemini returned a skin analysis with an invalid structure.',
    );
  }
  return value;
}

function isSkinAnalysisResult(value: unknown): value is SkinAnalysisResult {
  if (!isRecord(value) || value.schemaVersion !== '1.0') return false;
  const { metrics, regions } = value;
  if (
    !isRecord(value.quality) ||
    typeof value.quality.accepted !== 'boolean' ||
    !isStringArray(value.quality.issues) ||
    !isRecord(value.summary) ||
    !isIntegerInRange(value.summary.overallSkinScore, 0, 100) ||
    !isUnitInterval(value.summary.confidence) ||
    !isStringArray(value.summary.notes) ||
    !isSkinProfile(value.skinProfile) ||
    !isRecord(metrics) ||
    !isRecord(regions) ||
    !Array.isArray(value.observations) ||
    !Array.isArray(value.highlights) ||
    !isStringArray(value.limitations)
  )
    return false;

  const metricNames = [
    'acne',
    'redness',
    'darkSpots',
    'pores',
    'dryness',
    'oiliness',
    'unevenTexture',
  ];
  const regionNames = ['forehead', 'leftCheek', 'rightCheek', 'nose', 'chin'];
  return (
    metricNames.every((name) => isAssessment(metrics[name])) &&
    regionNames.every((name) => isAssessment(regions[name])) &&
    value.observations.every(isObservation) &&
    value.highlights.every(isHighlight)
  );
}

function isSkinProfile(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value.skinType === null ||
      (typeof value.skinType === 'string' &&
        ['NORMAL', 'DRY', 'OILY', 'COMBINATION'].includes(value.skinType))) &&
    (value.sensitivityLevel === null ||
      (typeof value.sensitivityLevel === 'string' &&
        ['LOW', 'MEDIUM', 'HIGH'].includes(value.sensitivityLevel))) &&
    (value.notes === null || typeof value.notes === 'string')
  );
}

function isAssessment(value: unknown): boolean {
  return (
    isRecord(value) &&
    isIntegerInRange(value.score, 0, 100) &&
    isUnitInterval(value.confidence) &&
    isVisibility(value.visibility)
  );
}

function isObservation(value: unknown): boolean {
  return (
    isRecord(value) &&
    [
      'VISIBLE_ACNE',
      'VISIBLE_REDNESS',
      'VISIBLE_DARK_SPOTS',
      'VISIBLE_PORES',
      'VISIBLE_DRYNESS',
      'VISIBLE_OILINESS',
      'UNEAVEN_TEXTURE',
    ].includes(String(value.type)) &&
    isIntegerInRange(value.severity, 0, 4) &&
    isUnitInterval(value.confidence) &&
    isVisibility(value.visibility) &&
    (value.note === null || typeof value.note === 'string') &&
    Array.isArray(value.box2d) &&
    value.box2d.length === 4 &&
    value.box2d.every((coordinate) => isIntegerInRange(coordinate, 0, 1000))
  );
}

function isHighlight(value: unknown): boolean {
  return (
    isRecord(value) &&
    [
      'acne',
      'redness',
      'darkSpots',
      'pores',
      'dryness',
      'oiliness',
      'unevenTexture',
    ].includes(String(value.type)) &&
    typeof value.label === 'string' &&
    value.label.length > 0 &&
    isIntegerInRange(value.x, 0, 1000) &&
    isIntegerInRange(value.y, 0, 1000) &&
    isIntegerInRange(value.radius, 1, 1000) &&
    isIntegerInRange(value.severity, 0, 4) &&
    isUnitInterval(value.confidence)
  );
}

function isVisibility(value: unknown): boolean {
  return ['CLEAR', 'UNCERTAIN', 'NOT_VISIBLE'].includes(String(value));
}
function isIntegerInRange(
  value: unknown,
  minimum: number,
  maximum: number,
): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= minimum &&
    value <= maximum
  );
}
function isUnitInterval(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
  );
}
function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === 'string')
  );
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
