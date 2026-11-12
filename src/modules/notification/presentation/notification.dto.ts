import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
export class NotificationPreferencesDto {
  @IsOptional() @IsBoolean() routineReminders?: boolean;
  @IsOptional() @IsBoolean() analysisUpdates?: boolean;
  @IsOptional() @IsBoolean() productRecommendations?: boolean;
  @IsOptional() @IsBoolean() marketing?: boolean;
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  reminderTime?: string;
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Matches(/^[A-Za-z_+-]+(?:\/[A-Za-z0-9_+-]+)*$/)
  timezone?: string;
}
export class NotificationListQueryDto {
  @IsOptional() @IsInt() @Min(1) page = 1;
  @IsOptional() @IsInt() @Min(1) @Max(100) limit = 20;
}
