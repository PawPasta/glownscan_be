import { IsInt, IsString, Matches, MaxLength, Min } from 'class-validator';

export class ConfirmSkinAnalysisUploadDto {
  @IsString()
  @Matches(/^glownscan\/skin-analysis\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/i)
  publicId!: string;

  @IsInt()
  @Min(1)
  version!: number;

  @IsString()
  @Matches(/^[a-f0-9]{40}$/i)
  signature!: string;

  @IsString()
  @Matches(/^https:\/\/res\.cloudinary\.com\/.+$/)
  @MaxLength(2048)
  secureUrl!: string;
}
