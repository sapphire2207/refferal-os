import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEmail,
  IsDateString,
  IsInt,
  Min,
  Max,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePatientDto {
  @ApiProperty({ example: 'Eleanor' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ example: 'Vance' })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiProperty({ example: '1954-08-12', description: 'ISO Date YYYY-MM-DD' })
  @IsDateString()
  @IsNotEmpty()
  dateOfBirth: string;

  @ApiPropertyOptional({ example: 'MRN-884920' })
  @IsOptional()
  @IsString()
  medicalRecordNumber?: string;

  @ApiPropertyOptional({ example: '305-555-0199' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'eleanor.vance@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '742 Evergreen Terrace' })
  @IsOptional()
  @IsString()
  addressLine1?: string;

  @ApiPropertyOptional({ example: 'Apt 4B' })
  @IsOptional()
  @IsString()
  addressLine2?: string;

  @ApiPropertyOptional({ example: 'Miami' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ example: 'FL' })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional({ example: '33101' })
  @IsOptional()
  @IsString()
  zipCode?: string;

  @ApiPropertyOptional({ description: 'Flag to bypass duplicate warning if confirmed by intake' })
  @IsOptional()
  @IsBoolean()
  forceCreate?: boolean;
}

export class UpdatePatientDto {
  @ApiPropertyOptional({ example: 'Eleanor' })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional({ example: 'Vance' })
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional({ example: '1954-08-12' })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiPropertyOptional({ example: 'MRN-884920' })
  @IsOptional()
  @IsString()
  medicalRecordNumber?: string;

  @ApiPropertyOptional({ example: '305-555-0199' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'eleanor.vance@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '742 Evergreen Terrace' })
  @IsOptional()
  @IsString()
  addressLine1?: string;

  @ApiPropertyOptional({ example: 'Apt 4B' })
  @IsOptional()
  @IsString()
  addressLine2?: string;

  @ApiPropertyOptional({ example: 'Miami' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ example: 'FL' })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional({ example: '33101' })
  @IsOptional()
  @IsString()
  zipCode?: string;
}

export class QueryPatientsDto {
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

  @ApiPropertyOptional({ description: 'Free-text search across name, MRN, phone, email' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ example: '1954-08-12' })
  @IsOptional()
  @IsDateString()
  dob?: string;

  @ApiPropertyOptional({ example: 'FL' })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional({ example: 'Miami' })
  @IsOptional()
  @IsString()
  city?: string;
}

export class CheckDuplicatePatientDto {
  @ApiProperty({ example: 'Eleanor' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ example: 'Vance' })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiProperty({ example: '1954-08-12' })
  @IsDateString()
  @IsNotEmpty()
  dateOfBirth: string;

  @ApiPropertyOptional({ example: 'MRN-884920' })
  @IsOptional()
  @IsString()
  medicalRecordNumber?: string;

  @ApiPropertyOptional({ example: '305-555-0199' })
  @IsOptional()
  @IsString()
  phone?: string;
}

export interface DuplicateMatchResult {
  patient: any;
  matchScore: number;
  matchLevel: 'EXACT' | 'HIGH_PROBABILITY' | 'POTENTIAL';
  matchReasons: string[];
}
