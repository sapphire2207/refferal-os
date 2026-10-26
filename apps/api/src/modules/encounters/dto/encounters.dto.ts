import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsUUID,
  IsDateString,
  IsArray,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VisitOutcome, NoteReviewDecision } from '@heals/types';

export class CreateEncounterDto {
  @ApiProperty({ example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' })
  @IsUUID('4', { message: 'referralId must be a valid UUID' })
  @IsNotEmpty()
  referralId: string;

  @ApiPropertyOptional({ example: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33' })
  @IsOptional()
  @IsUUID('4')
  appointmentId?: string;

  @ApiProperty({ enum: VisitOutcome, example: VisitOutcome.COMPLETED })
  @IsEnum(VisitOutcome)
  @IsNotEmpty()
  outcome: VisitOutcome;

  @ApiPropertyOptional({ example: '2026-11-05' })
  @IsOptional()
  @IsDateString()
  dateOfService?: string;

  @ApiPropertyOptional({ description: 'Defaults to current user if caller is NP' })
  @IsOptional()
  @IsUUID('4')
  nursePractitionerId?: string;

  @ApiProperty({
    example: ['Comprehensive Physical Exam', 'Wound Debridement', 'Medication Reconciliation'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  servicesProvided: string[];

  @ApiPropertyOptional({ example: 'Patient was responsive, alert, wound healing appropriately.' })
  @IsOptional()
  @IsString()
  encounterNotes?: string;
}

export class CreateClinicalNoteDto {
  @ApiProperty({ example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' })
  @IsUUID('4')
  @IsNotEmpty()
  referralId: string;

  @ApiProperty({ example: 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44' })
  @IsUUID('4')
  @IsNotEmpty()
  encounterId: string;

  @ApiProperty({ example: 'PROGRESS_NOTE' })
  @IsString()
  @IsNotEmpty()
  noteType: string;

  @ApiProperty({
    example: 'Subjective: Patient reports reduced joint pain. Objective: Vital signs stable BP 120/80. Assessment: Improved mobility. Plan: Continue current medication regimen.',
  })
  @IsString()
  @IsNotEmpty()
  content: string;
}

export class UpdateClinicalNoteDto {
  @ApiProperty({
    example: 'Updated draft content before signing...',
  })
  @IsString()
  @IsNotEmpty()
  content: string;
}

export class ReviewNoteDto {
  @ApiProperty({
    enum: NoteReviewDecision,
    example: NoteReviewDecision.APPROVE,
  })
  @IsEnum(NoteReviewDecision)
  @IsNotEmpty()
  decision: NoteReviewDecision;

  @ApiPropertyOptional({ example: 'Clinical documentation complies with QA guidelines.' })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({
    description: 'Mandatory if decision is RETURN_FOR_CORRECTION',
    example: 'Please specify the exact wound dressing materials and dimensions used.',
  })
  @IsOptional()
  @IsString()
  correctionRequired?: string;
}

export class QueryEncountersDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  referralId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  nursePractitionerId?: string;

  @ApiPropertyOptional({ enum: VisitOutcome })
  @IsOptional()
  @IsEnum(VisitOutcome)
  outcome?: VisitOutcome;

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
}
