import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

export type PremiumPackage = string;

export class CreateTopUpDto {
  @IsInt()
  @Min(10_000)
  @Max(50_000_000)
  amountVnd!: number;
}

export class CreatePremiumCheckoutDto {
  @IsString()
  @Matches(/^PREMIUM_[A-Z0-9_]+$/)
  packageCode!: PremiumPackage;
}

export class CancelPaymentOrderDto {
  @IsString()
  @IsNotEmpty()
  cancelReason!: string;
}

export class RefundPaymentOrderDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;
}

export class SePayWebhookDto {
  @Transform(({ value }: { value: unknown }) => String(value))
  @IsString()
  @IsNotEmpty()
  id!: string | number;

  @IsString()
  @IsNotEmpty()
  transferType!: string;

  @IsInt()
  @Min(1)
  transferAmount!: number;

  @IsOptional()
  @IsString()
  code?: string | null;

  @IsOptional()
  @IsString()
  content?: string | null;

  @IsOptional()
  @IsString()
  description?: string | null;
}
