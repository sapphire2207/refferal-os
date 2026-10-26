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
import {
  PipelineStage,
  WorkStatus,
  CaseOutcome,
  BillingStatus,
  UserRole,
} from '@heals/types';
import { Priority } from '@prisma/client';

export class CreateReferralDto {
  @IsUUID('4', { message: 'patientId must be a valid UUID' })
  patientId: string;

  @IsOptional()
  @IsString()
  referralSource?: string;

  @IsOptional()
  @IsString()
  referringProvider?: string;

  @IsOptional()
  @IsString()
  referringProviderNpi?: string;

  @IsOptional()
  @IsString()
  referringFacility?: string;

  @IsOptional()
  @IsString()
  insurancePayer?: string;

  @IsOptional()
  @IsString()
  insuranceMemberId?: string;

  @IsOptional()
  @IsString()
  insuranceGroupNumber?: string;

  @IsOptional()
  @IsBoolean()
  coverageVerified?: boolean;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  coverageVerificationDate?: Date;

  @IsOptional()
  @IsString()
  coverageNotes?: string;

  @IsOptional()
  @IsString()
  site?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  legalEntity?: string;

  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @IsOptional()
  @IsUUID('4')
  assignedTo?: string;

  @IsOptional()
  @IsEnum(UserRole)
  assignedRole?: UserRole;
}

export class UpdateReferralDto {
  @IsInt({ message: 'version is required for optimistic concurrency' })
  version: number;

  @IsOptional()
  @IsString()
  referralSource?: string;

  @IsOptional()
  @IsString()
  referringProvider?: string;

  @IsOptional()
  @IsString()
  referringProviderNpi?: string;

  @IsOptional()
  @IsString()
  referringFacility?: string;

  @IsOptional()
  @IsString()
  insurancePayer?: string;

  @IsOptional()
  @IsString()
  insuranceMemberId?: string;

  @IsOptional()
  @IsString()
  insuranceGroupNumber?: string;

  @IsOptional()
  @IsBoolean()
  coverageVerified?: boolean;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  coverageVerificationDate?: Date;

  @IsOptional()
  @IsString()
  coverageNotes?: string;

  @IsOptional()
  @IsString()
  site?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  legalEntity?: string;

  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @IsOptional()
  @IsUUID('4')
  assignedTo?: string;

  @IsOptional()
  @IsEnum(UserRole)
  assignedRole?: UserRole;
}

export class QueryReferralsDto {
  @IsOptional()
  @IsEnum(PipelineStage)
  pipelineStage?: PipelineStage;

  @IsOptional()
  @IsEnum(WorkStatus)
  workStatus?: WorkStatus;

  @IsOptional()
  @IsEnum(CaseOutcome)
  caseOutcome?: CaseOutcome;

  @IsOptional()
  @IsEnum(BillingStatus)
  billingStatus?: BillingStatus;

  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @IsOptional()
  @IsString()
  site?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  legalEntity?: string;

  @IsOptional()
  @IsUUID('4')
  assignedTo?: string;

  @IsOptional()
  @IsEnum(UserRole)
  assignedRole?: UserRole;

  @IsOptional()
  @IsUUID('4')
  patientId?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;
}
