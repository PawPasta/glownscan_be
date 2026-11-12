import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type { PremiumPackageCode } from '../domain/entities/premium-package.entity.js';

export type PremiumPackage = PremiumPackageCode;

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

export class CreatePaymentSupportRequestDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  subject!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  note!: string;
}

export class PaymentPaginationQueryDto {
  @Transform(({ value }: { value: unknown }) =>
    value === undefined ? value : Number(value),
  )
  @IsOptional()
  @IsInt()
  @Min(1)
  page = 1;

  @Transform(({ value }: { value: unknown }) =>
    value === undefined ? value : Number(value),
  )
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

export class AdminPaymentOrderQueryDto extends PaymentPaginationQueryDto {
  @IsOptional()
  @IsString()
  @IsIn(['PENDING', 'PAID', 'CANCELLED', 'EXPIRED', 'REFUNDED', 'FAILED'])
  status?: string;
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
