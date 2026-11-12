import { Type } from 'class-transformer';
import {
  IsArray,
  ArrayMaxSize,
  IsBoolean,
  IsDateString,
  IsInt,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MinLength,
  IsUrl,
  Max,
  MaxLength,
  Min,
  ValidateNested,
  ValidateIf,
} from 'class-validator';
import type { RoutinePeriod } from '../domain/routine.types.js';

export class RoutinePreferencesDto {
  @IsBoolean() morning!: boolean;
  @IsBoolean() evening!: boolean;
  @IsInt() @Min(1) @Max(8) maxStepsPerRoutine = 4;
}
export class CreateRoutineDraftDto {
  @IsOptional() @IsUUID() analysisSessionId?: string | null;
  @ValidateNested()
  @Type(() => RoutinePreferencesDto)
  preferences!: RoutinePreferencesDto;
}
export class RoutineProductDto {
  @IsUUID() id!: string;
  @IsString() @MaxLength(200) name!: string;
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @MaxLength(150)
  brand!: string | null;
  @ValidateIf((_object, value) => value !== null)
  @IsUrl({ require_protocol: true })
  imageUrl!: string | null;
}
export class RoutineStepDto {
  @IsOptional() @IsUUID() id?: string;
  @IsIn(['MORNING', 'EVENING']) period!: RoutinePeriod;
  @IsInt() @Min(1) position!: number;
  @IsString() @Matches(/\S/) @MaxLength(100) title!: string;
  @IsString() @Matches(/\S/) @MaxLength(1000) instruction!: string;
  @IsBoolean() optional!: boolean;
  @IsOptional()
  @ValidateNested()
  @Type(() => RoutineProductDto)
  product?: RoutineProductDto | null;
}
export class UpdateRoutineDto {
  @IsOptional()
  @IsString()
  @Matches(/\S/)
  @MinLength(1)
  @MaxLength(150)
  title?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => RoutineStepDto)
  morningSteps?: RoutineStepDto[];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => RoutineStepDto)
  eveningSteps?: RoutineStepDto[];
}
export class CheckInDto {
  @IsArray()
  @ArrayMaxSize(16)
  @IsUUID(undefined, { each: true })
  completedStepIds!: string[];
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}
export class CheckInHistoryQueryDto {
  @IsDateString({ strict: true }) from!: string;
  @IsDateString({ strict: true }) to!: string;
}
