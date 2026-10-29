import {
  IsString,
  IsOptional,
  IsBoolean,
  IsEnum,
  IsInt,
  IsUUID,
  IsDate,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  PipelineStage,
  WorkStatus,
  CaseOutcome,
  BillingStatus,
  UserRole,
} from '@heals/types';
import { Priority } from '@prisma/client';

export class CreateReferralDto {
  @ApiProperty({ description: 'Target patient UUID', example: '11111111-1111-1111-1111-111111111111' })
  @IsUUID('4', { message: 'patientId must be a valid UUID' })
  patientId: string;

  @ApiPropertyOptional({ description: 'Referral source channel', example: 'Clinic Portal' })
  @IsOptional()
  @IsString()
  referralSource?: string;

  @ApiPropertyOptional({ description: 'Referring provider name', example: 'Dr. Gregory House' })
  @IsOptional()
  @IsString()
  referringProvider?: string;

  @ApiPropertyOptional({ description: '10-digit National Provider Identifier', example: '1234567890' })
  @IsOptional()
  @IsString()
  referringProviderNpi?: string;

  @ApiPropertyOptional({ description: 'Originating medical facility', example: 'Princeton-Plainsboro' })
  @IsOptional()
  @IsString()
  referringFacility?: string;

  @ApiPropertyOptional({ description: 'Primary health insurance payer', example: 'Blue Cross Blue Shield' })
  @IsOptional()
  @IsString()
  insurancePayer?: string;

  @ApiPropertyOptional({ description: 'Insurance member/subscriber ID', example: 'MEM12345678' })
  @IsOptional()
  @IsString()
  insuranceMemberId?: string;

  @ApiPropertyOptional({ description: 'Insurance group policy number', example: 'GRP987654' })
  @IsOptional()
  @IsString()
  insuranceGroupNumber?: string;

  @ApiPropertyOptional({ description: 'Whether active coverage was verified', example: true })
  @IsOptional()
  @IsBoolean()
  coverageVerified?: boolean;

  @ApiPropertyOptional({ description: 'Timestamp when coverage was verified', example: '2026-10-26T12:00:00Z' })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  coverageVerificationDate?: Date;

  @ApiPropertyOptional({ description: 'Notes regarding coverage verification', example: 'Copay $20, deductible met' })
  @IsOptional()
  @IsString()
  coverageNotes?: string;

  @ApiPropertyOptional({ description: 'Operating site identifier', example: 'site-a' })
  @IsOptional()
  @IsString()
  site?: string;

  @ApiPropertyOptional({ description: 'Two-letter US state code', example: 'CA' })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional({ description: 'Operating legal entity', example: 'legal-entity-1' })
  @IsOptional()
  @IsString()
  legalEntity?: string;

  @ApiPropertyOptional({ enum: Priority, description: 'Clinical referral triage priority', example: 'ROUTINE' })
  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @ApiPropertyOptional({ description: 'Assigned specialist user UUID', example: '22222222-2222-2222-2222-222222222222' })
  @IsOptional()
  @IsUUID('4')
  assignedTo?: string;

  @ApiPropertyOptional({ enum: UserRole, description: 'Assigned role queue', example: UserRole.INTAKE_SPECIALIST })
  @IsOptional()
  @IsEnum(UserRole)
  assignedRole?: UserRole;
}

export class UpdateReferralDto {
  @ApiProperty({ description: 'Current record version for optimistic concurrency control', example: 1 })
  @IsInt({ message: 'version is required for optimistic concurrency' })
  version: number;

  @ApiPropertyOptional({ description: 'Referral source channel', example: 'Clinic Portal' })
  @IsOptional()
  @IsString()
  referralSource?: string;

  @ApiPropertyOptional({ description: 'Referring provider name', example: 'Dr. Gregory House' })
  @IsOptional()
  @IsString()
  referringProvider?: string;

  @ApiPropertyOptional({ description: '10-digit National Provider Identifier', example: '1234567890' })
  @IsOptional()
  @IsString()
  referringProviderNpi?: string;

  @ApiPropertyOptional({ description: 'Originating medical facility', example: 'Princeton-Plainsboro' })
  @IsOptional()
  @IsString()
  referringFacility?: string;

  @ApiPropertyOptional({ description: 'Primary health insurance payer', example: 'Blue Cross Blue Shield' })
  @IsOptional()
  @IsString()
  insurancePayer?: string;

  @ApiPropertyOptional({ description: 'Insurance member/subscriber ID', example: 'MEM12345678' })
  @IsOptional()
  @IsString()
  insuranceMemberId?: string;

  @ApiPropertyOptional({ description: 'Insurance group policy number', example: 'GRP987654' })
  @IsOptional()
  @IsString()
  insuranceGroupNumber?: string;

  @ApiPropertyOptional({ description: 'Whether active coverage was verified', example: true })
  @IsOptional()
  @IsBoolean()
  coverageVerified?: boolean;

  @ApiPropertyOptional({ description: 'Timestamp when coverage was verified', example: '2026-10-26T12:00:00Z' })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  coverageVerificationDate?: Date;

  @ApiPropertyOptional({ description: 'Notes regarding coverage verification', example: 'Copay $20, deductible met' })
  @IsOptional()
  @IsString()
  coverageNotes?: string;

  @ApiPropertyOptional({ description: 'Operating site identifier', example: 'site-a' })
  @IsOptional()
  @IsString()
  site?: string;

  @ApiPropertyOptional({ description: 'Two-letter US state code', example: 'CA' })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional({ description: 'Operating legal entity', example: 'legal-entity-1' })
  @IsOptional()
  @IsString()
  legalEntity?: string;

  @ApiPropertyOptional({ enum: Priority, description: 'Clinical referral triage priority', example: 'URGENT' })
  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @ApiPropertyOptional({ description: 'Assigned specialist user UUID', example: '22222222-2222-2222-2222-222222222222' })
  @IsOptional()
  @IsUUID('4')
  assignedTo?: string;

  @ApiPropertyOptional({ enum: UserRole, description: 'Assigned role queue', example: UserRole.CLINICAL_REVIEWER })
  @IsOptional()
  @IsEnum(UserRole)
  assignedRole?: UserRole;
}

export class QueryReferralsDto {
  @ApiPropertyOptional({ enum: PipelineStage, description: 'Filter by current pipeline stage' })
  @IsOptional()
  @IsEnum(PipelineStage)
  pipelineStage?: PipelineStage;

  @ApiPropertyOptional({ enum: PipelineStage, description: 'Filter by current pipeline stage (alias for pipelineStage)' })
  @IsOptional()
  @IsEnum(PipelineStage)
  stage?: PipelineStage;

  @ApiPropertyOptional({ enum: WorkStatus, description: 'Filter by operational work status' })
  @IsOptional()
  @IsEnum(WorkStatus)
  workStatus?: WorkStatus;

  @ApiPropertyOptional({ enum: CaseOutcome, description: 'Filter by terminal case outcome' })
  @IsOptional()
  @IsEnum(CaseOutcome)
  caseOutcome?: CaseOutcome;

  @ApiPropertyOptional({ enum: BillingStatus, description: 'Filter by billing qualification status' })
  @IsOptional()
  @IsEnum(BillingStatus)
  billingStatus?: BillingStatus;

  @ApiPropertyOptional({ enum: Priority, description: 'Filter by clinical priority' })
  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @ApiPropertyOptional({ description: 'Filter by site code' })
  @IsOptional()
  @IsString()
  site?: string;

  @ApiPropertyOptional({ description: 'Filter by US state' })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional({ description: 'Filter by legal entity' })
  @IsOptional()
  @IsString()
  legalEntity?: string;

  @ApiPropertyOptional({ description: 'Filter by assigned user UUID' })
  @IsOptional()
  @IsUUID('4')
  assignedTo?: string;

  @ApiPropertyOptional({ enum: UserRole, description: 'Filter by assigned role queue' })
  @IsOptional()
  @IsEnum(UserRole)
  assignedRole?: UserRole;

  @ApiPropertyOptional({ description: 'Filter by patient UUID' })
  @IsOptional()
  @IsUUID('4')
  patientId?: string;

  @ApiPropertyOptional({ description: 'Free-text search across patient, payer, or facility' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Pagination limit (max 100)', default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Pagination offset', default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;
}

