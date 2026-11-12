export type PremiumPackageCode = string;

export interface PremiumPackage {
  code: PremiumPackageCode;
  name: string;
  amountVnd: number;
  durationDays: number;
  isActive: boolean;
}
