import type { RoutineDraftInput } from './routine-data.port.js';

export const ROUTINE_FINGERPRINT_PORT = Symbol('ROUTINE_FINGERPRINT_PORT');

export interface RoutineFingerprintPort {
  fingerprint(input: RoutineDraftInput): string;
}
