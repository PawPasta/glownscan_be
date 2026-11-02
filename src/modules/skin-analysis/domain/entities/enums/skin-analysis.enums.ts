export enum AnalysisSessionStatus {
  UploadPending = 'UPLOAD_PENDING',
  Queued = 'QUEUED',
  Running = 'RUNNING',
  Succeeded = 'SUCCEEDED',
  Failed = 'FAILED',
  Rejected = 'REJECTED',
}

export enum AnalysisKind {
  Initial = 'INITIAL',
  FollowUp = 'FOLLOW_UP',
}

export enum AnalysisProvider {
  Gemini = 'GEMINI',
  YouCam = 'YOUCAM',
  HautAI = 'HAUT_AI',
}

export enum AnalysisImageView {
  Front = 'FRONT',
  Left = 'LEFT',
  Right = 'RIGHT',
}

export enum AnalysisObservationType {
  VisibleAcne = 'VISIBLE_ACNE',
  VisibleRedness = 'VISIBLE_REDNESS',
  VisibleDarkSpots = 'VISIBLE_DARK_SPOTS',
  VisiblePores = 'VISIBLE_PORES',
  VisibleDryness = 'VISIBLE_DRYNESS',
  VisibleOiliness = 'VISIBLE_OILINESS',
  UnevenTexture = 'UNEAVEN_TEXTURE',
}

export enum AnalysisObservationVisibility {
  Clear = 'CLEAR',
  Uncertain = 'UNCERTAIN',
  NotVisible = 'NOT_VISIBLE',
}

export enum AnalysisConsentPurpose {
  SkinAnalysis = 'SKIN_ANALYSIS',
}

export enum AnalysisOutboxEventType {
  ProcessAnalysis = 'PROCESS_ANALYSIS',
}

export enum AnalysisOutboxStatus {
  Pending = 'PENDING',
  Processing = 'PROCESSING',
  Published = 'PUBLISHED',
  Failed = 'FAILED',
}
