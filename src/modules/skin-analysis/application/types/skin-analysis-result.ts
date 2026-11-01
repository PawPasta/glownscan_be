export type SkinAnalysisVisibility = 'CLEAR' | 'UNCERTAIN' | 'NOT_VISIBLE';

export type SkinAnalysisMetric =
  | 'acne'
  | 'redness'
  | 'darkSpots'
  | 'pores'
  | 'dryness'
  | 'oiliness'
  | 'unevenTexture';

export type SkinAnalysisObservationType =
  | 'VISIBLE_ACNE'
  | 'VISIBLE_REDNESS'
  | 'VISIBLE_DARK_SPOTS'
  | 'VISIBLE_PORES'
  | 'VISIBLE_DRYNESS'
  | 'VISIBLE_OILINESS'
  | 'UNEAVEN_TEXTURE';

export interface SkinAnalysisAssessment {
  score: number;
  confidence: number;
  visibility: SkinAnalysisVisibility;
}

export interface SkinAnalysisObservation {
  type: SkinAnalysisObservationType;
  severity: number;
  confidence: number;
  visibility: SkinAnalysisVisibility;
  note: string | null;
  box2d: [number, number, number, number];
}

export interface SkinAnalysisHighlight {
  type: SkinAnalysisMetric;
  label: string;
  x: number;
  y: number;
  radius: number;
  severity: number;
  confidence: number;
}

export interface SkinAnalysisResult {
  schemaVersion: '1.0';
  quality: {
    accepted: boolean;
    issues: string[];
  };
  summary: {
    overallSkinScore: number;
    confidence: number;
    notes: string[];
  };
  metrics: Record<SkinAnalysisMetric, SkinAnalysisAssessment>;
  regions: Record<
    'forehead' | 'leftCheek' | 'rightCheek' | 'nose' | 'chin',
    SkinAnalysisAssessment
  >;
  observations: SkinAnalysisObservation[];
  highlights: SkinAnalysisHighlight[];
  limitations: string[];
}
