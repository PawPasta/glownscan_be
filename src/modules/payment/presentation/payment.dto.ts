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
  @MaxLength(20)
  transferType!: string;

  @IsInt()
  @Min(1)
  transferAmount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  gateway?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  transactionDate?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  accountNumber?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  subAccount?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  code?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  content?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  accumulated?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  referenceCode?: string | null;
}
