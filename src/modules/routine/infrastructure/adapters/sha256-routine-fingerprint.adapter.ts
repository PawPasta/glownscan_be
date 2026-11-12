import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { RoutineFingerprintPort } from '../../application/ports/routine-fingerprint.port.js';
import type { RoutineDraftInput } from '../../application/ports/routine-data.port.js';

@Injectable()
export class Sha256RoutineFingerprintAdapter implements RoutineFingerprintPort {
  fingerprint(input: RoutineDraftInput): string {
    return createHash('sha256')
      .update(
        JSON.stringify({
          analysisSessionId: input.analysisSessionId,
          morning: input.morning,
          evening: input.evening,
          maxStepsPerRoutine: input.maxStepsPerRoutine,
        }),
      )
      .digest('hex');
  }
}
