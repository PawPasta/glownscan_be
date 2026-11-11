import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class PaginationDto {
  @IsOptional() @Min(1) page = 1;
  @IsOptional() @Min(1) @Max(100) limit = 20;
  @IsOptional() @IsString() @MaxLength(120) search?: string;
}

export class CreateIngredientDto {
  @IsString() @MaxLength(150) name!: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateIngredientDto {
  @IsOptional() @IsString() @MaxLength(150) name?: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateSkinConcernDto {
  @IsString() @MaxLength(50) code!: string;
  @IsString() @MaxLength(150) name!: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateSkinConcernDto {
  @IsOptional() @IsString() @MaxLength(50) code?: string;
  @IsOptional() @IsString() @MaxLength(150) name?: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateProductDto {
  @IsString() @MaxLength(200) name!: string;
  @IsOptional() @IsString() @MaxLength(150) brand?: string;
  @IsOptional() @IsString() @MaxLength(8000) description?: string;
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  imageUrl?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  ingredientIds?: string[];
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  skinConcernIds?: string[];
}

export class UpdateProductDto {
  @IsOptional() @IsString() @MaxLength(200) name?: string;
  @IsOptional() @IsString() @MaxLength(150) brand?: string;
  @IsOptional() @IsString() @MaxLength(8000) description?: string;
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  imageUrl?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  ingredientIds?: string[];
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  skinConcernIds?: string[];
}

export class CreateAffiliateLinkDto {
  @IsString() @MaxLength(100) partnerName!: string;
  @IsUrl({ protocols: ['https'], require_protocol: true }) url!: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateAffiliateLinkDto {
  @IsOptional() @IsString() @MaxLength(100) partnerName?: string;
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  url?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CatalogStatusDto {
  @IsOptional() @IsIn(['true', 'false']) active?: 'true' | 'false';
}
