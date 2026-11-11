import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsString,
  ValidateNested,
} from 'class-validator';
import type { SkinAssessmentAnswers } from '../application/ports/skin-assessment.port.js';

const SKIN_TYPES = ['NORMAL', 'DRY', 'OILY', 'COMBINATION', 'NOT_SURE'];
const SENSITIVITY_LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'NOT_SURE'];
const CONCERNS = [
  'ACNE',
  'REDNESS',
  'DARK_SPOTS',
  'PORES',
  'DRYNESS',
  'OILINESS',
  'TEXTURE',
  'NONE',
];
const GOALS = [
  'REDUCE_ACNE',
  'EVEN_TONE',
  'HYDRATION',
  'OIL_CONTROL',
  'ANTI_AGING',
  'MAINTAIN_HEALTHY_SKIN',
];

export class SkinAssessmentAnswersDto implements SkinAssessmentAnswers {
  @IsString()
  @IsIn(SKIN_TYPES)
  skinType!: SkinAssessmentAnswers['skinType'];

  @IsString()
  @IsIn(SENSITIVITY_LEVELS)
  sensitivity!: SkinAssessmentAnswers['sensitivity'];

  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(7)
  @IsIn(CONCERNS, { each: true })
  concerns!: SkinAssessmentAnswers['concerns'];

  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(6)
  @IsIn(GOALS, { each: true })
  goals!: SkinAssessmentAnswers['goals'];
}

export class SaveSkinAssessmentDto {
  @ValidateNested()
  @Type(() => SkinAssessmentAnswersDto)
  answers!: SkinAssessmentAnswersDto;
}
