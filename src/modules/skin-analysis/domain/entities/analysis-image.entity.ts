import type { Uuid } from '../../../../shared/types/domain.types.js';
import { AnalysisImageView } from './enums/skin-analysis.enums.js';

export interface AnalysisImage {
  id: Uuid;
  sessionId: Uuid;
  imageView: AnalysisImageView;
  storagePublicId: string;
  mimeType: string;
  byteSize: number;
  width: number;
  height: number;
  sha256: string;
  createdAt: Date;
  deletedAt: Date | null;
}
