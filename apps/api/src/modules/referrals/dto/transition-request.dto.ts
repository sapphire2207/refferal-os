import { IsEnum, IsOptional, IsString, IsInt, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PipelineStage } from '@heals/types';

/**
 * DTO for requesting a stage transition on a referral.
 * 
 * This DTO validates the transition request before it reaches the WorkflowService.
 * It ensures the target stage is valid, version is provided for optimistic concurrency,
 * and optional metadata/reason fields are properly formatted.
 * 
 * Requirements:
 * - 1.1: Authorization check for transition action permission
 * - 1.2: Scope access verification
 * - 1.3: Forward transition validation against ALLOWED_TRANSITIONS
 * - 1.4: Required fields validation per REQUIRED_FIELDS_PER_STAGE
 */
export class TransitionRequestDto {
  /**
   * The target pipeline stage to transition to.
   * Must be a valid PipelineStage enum value.
   */
  @ApiProperty({
    enum: PipelineStage,
    description: 'Target pipeline stage',
    example: PipelineStage.CLINICAL_REVIEW,
  })
  @IsEnum(PipelineStage, {
    message: 'targetStage must be a valid pipeline stage',
  })
  targetStage: PipelineStage;

  /**
   * Optional reason for the transition.
   * Required for backward transitions and certain workflow gates.
   */
  @ApiPropertyOptional({
    description: 'Reason documentation (required for backward corrections)',
    example: 'Insurance verification complete',
  })
  @IsOptional()
  @IsString()
  reason?: string;

  /**
   * Current version of the referral for optimistic concurrency control.
   * Must match the database version for the transition to succeed.
   */
  @ApiProperty({
    description: 'Current referral version for optimistic concurrency control',
    example: 1,
  })
  @IsInt()
  version: number;

  /**
   * Optional metadata for transition-specific information.
   * Can include context like return-to-originator flags, clinical notes, etc.
   */
  @ApiPropertyOptional({
    description: 'Supplemental transition metadata payload',
    example: { npId: 'np-uuid-1' },
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;

  /**
   * Optional idempotency key for duplicate request handling.
   * When provided, duplicate requests with the same key will return the cached response.
   */
  @ApiPropertyOptional({
    description: 'Idempotency key for safe network retries',
    example: 'idem-4f3b-8219-c12',
  })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}
