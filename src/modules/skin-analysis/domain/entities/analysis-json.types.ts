export type AnalysisJsonValue =
  | null
  | boolean
  | number
  | string
  | AnalysisJsonValue[]
  | { [key: string]: AnalysisJsonValue };
