import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateUserProfileDto {
  @IsOptional()
  @IsString()
  @Matches(/\S/)
  @MaxLength(150)
  fullName?: string | null;

  @IsOptional()
  @IsDateString({ strict: true })
  dateOfBirth?: string | null;

  @IsOptional()
  @IsIn(['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY'])
  gender?: 'MALE' | 'FEMALE' | 'OTHER' | 'PREFER_NOT_TO_SAY' | null;
}

export class UpdateSkinProfileDto {
  @IsOptional()
  @IsIn(['NORMAL', 'DRY', 'OILY', 'COMBINATION'])
  skinType?: 'NORMAL' | 'DRY' | 'OILY' | 'COMBINATION' | null;

  @IsOptional()
  @IsIn(['LOW', 'MEDIUM', 'HIGH'])
  sensitivityLevel?: 'LOW' | 'MEDIUM' | 'HIGH' | null;

  @IsOptional()
  @IsString()
  @Matches(/\S/)
  @MaxLength(5000)
  notes?: string | null;
}

export class ConfirmAvatarUploadDto {
  @IsString()
  @Matches(/^glownscan\/avatars\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/i)
  publicId!: string;

  @IsInt()
  @Min(1)
  version!: number;

  @IsString()
  @Matches(/^[a-f0-9]{40}$/i)
  signature!: string;

  @IsString()
  @MaxLength(2048)
  secureUrl!: string;
}
