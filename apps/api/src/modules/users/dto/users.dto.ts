import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEmail,
  IsArray,
  IsEnum,
  IsBoolean,
  ValidateNested,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@heals/types';

export class UserScopeItemDto {
  @ApiPropertyOptional({ example: 'FL-MIAMI-CLINIC-01' })
  @IsOptional()
  @IsString()
  site?: string;

  @ApiPropertyOptional({ example: 'FL' })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional({ example: 'HEALS_ON_WHEELS_FL' })
  @IsOptional()
  @IsString()
  legalEntity?: string;
}

export class CreateUserInviteDto {
  @ApiProperty({ example: 'dr.smith@healsonwheels.com' })
  @IsEmail({}, { message: 'A valid email address is required' })
  email: string;

  @ApiProperty({ example: 'John' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ example: 'Smith' })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiProperty({
    enum: UserRole,
    isArray: true,
    example: [UserRole.CLINICAL_REVIEWER],
  })
  @IsArray()
  @IsEnum(UserRole, { each: true })
  roles: UserRole[];

  @ApiPropertyOptional({ type: [UserScopeItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UserScopeItemDto)
  scopes?: UserScopeItemDto[];
}

export class UpdateUserRolesDto {
  @ApiProperty({
    enum: UserRole,
    isArray: true,
    example: [UserRole.CLINICAL_REVIEWER, UserRole.SCHEDULER],
  })
  @IsArray()
  @IsEnum(UserRole, { each: true })
  roles: UserRole[];
}

export class UpdateUserScopesDto {
  @ApiProperty({ type: [UserScopeItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UserScopeItemDto)
  scopes: UserScopeItemDto[];
}

export class UpdateUserStatusDto {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isSuspended?: boolean;

  @ApiPropertyOptional({ example: 'Suspended pending compliance investigation' })
  @IsOptional()
  @IsString()
  suspendedReason?: string;
}

export class UpdateUserProfileDto {
  @ApiPropertyOptional({ example: 'John' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  firstName?: string;

  @ApiPropertyOptional({ example: 'Doe' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  lastName?: string;
}

export class QueryUsersDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Search query across name or email' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: UserRole })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isSuspended?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  site?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  legalEntity?: string;
}
