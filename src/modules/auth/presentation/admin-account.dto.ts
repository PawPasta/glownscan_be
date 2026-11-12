import {
  IsArray,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
export class AdminAccountQueryDto {
  @IsOptional() @Min(1) page = 1;
  @IsOptional() @Min(1) @Max(100) limit = 20;
  @IsOptional() @IsString() @MaxLength(120) search?: string;
}
export class CreateAdminAccountDto {
  @IsEmail() @MaxLength(320) email!: string;
  @IsString() @MinLength(6) @MaxLength(72) password!: string;
  @IsOptional() @IsString() @MaxLength(150) fullName?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) roleCodes?: string[];
}
export class UpdateAdminAccountDto {
  @IsOptional() @IsString() @MaxLength(150) fullName?: string;
  @IsOptional() @IsIn(['ACTIVE', 'SUSPENDED']) status?: 'ACTIVE' | 'SUSPENDED';
  @IsOptional() @IsArray() @IsString({ each: true }) roleCodes?: string[];
}
