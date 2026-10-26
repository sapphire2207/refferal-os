import {
  IsEnum,
  IsOptional,
  IsString,
  IsInt,
  IsDate,
  ValidateIf,
  MinLength,
  IsNotEmpty,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { WorkStatus } from '@heals/types';

/**
 * DTO for updating work status on a referral.
 * 
 * This DTO validates work status changes independently from stage transitions.
 * It enforces that BLOCKED_NEEDS_INFO and ON_HOLD statuses require documentation
 * of the reason and (for ON_HOLD) a next review date.
 * 
 * Requirements:
 * - 10.3: Work status change authorization validation
 * - 10.4: BLOCKED_NEEDS_INFO requires reason documenting what is missing
 * - 10.5: ON_HOLD requires hold reason and next review date
 * - 10.8: BLOCKED_NEEDS_INFO to IN_PROGRESS requires resolution documentation
 */
export class UpdateWorkStatusDto {
  /**
   * The target work status to transition to.
   * Must be a valid WorkStatus enum value.
   */
  @ApiProperty({
    enum: WorkStatus,
    description: 'Target operational work status',
    example: WorkStatus.IN_PROGRESS,
  })
  @IsEnum(WorkStatus, {
    message: 'workStatus must be a valid work status',
  })
  workStatus: WorkStatus;

  /**
   * Reason for the work status change.
   * 
   * REQUIRED when:
   * - workStatus is BLOCKED_NEEDS_INFO (documents what information is missing)
   * - workStatus is ON_HOLD (documents why work is paused)
   * - transitioning FROM BLOCKED_NEEDS_INFO (documents how issues were resolved)
   * 
   * OPTIONAL for:
   * - PENDING, IN_PROGRESS, COMPLETED status changes
   */
  @ApiPropertyOptional({
    description: 'Detailed reason for status change (min 10 characters for BLOCKED and ON_HOLD)',
    example: 'Awaiting updated lab panel from referring provider',
  })
  @ValidateIf(
    (o) =>
      o.workStatus === WorkStatus.BLOCKED_NEEDS_INFO ||
      o.workStatus === WorkStatus.ON_HOLD ||
      (o.reason !== undefined && o.reason !== null),
  )
  @IsNotEmpty({
    message: 'Reason is required when setting BLOCKED_NEEDS_INFO or ON_HOLD status',
  })
  @IsString()
  @MinLength(10, {
    message:
      'Reason must be at least 10 characters when setting BLOCKED_NEEDS_INFO or ON_HOLD status',
  })
  reason?: string;

  /**
   * Next review date for ON_HOLD status.
   * 
   * REQUIRED when workStatus is ON_HOLD.
   * Specifies when the referral should be reviewed again.
   */
  @ApiPropertyOptional({
    description: 'Next scheduled review date (required for ON_HOLD)',
    example: '2026-11-01T00:00:00.000Z',
  })
  @ValidateIf(
    (o) =>
      o.workStatus === WorkStatus.ON_HOLD ||
      (o.nextReviewDate !== undefined && o.nextReviewDate !== null),
  )
  @IsNotEmpty({
    message: 'Next review date is required when setting ON_HOLD status',
  })
  @IsDate()
  @Type(() => Date)
  nextReviewDate?: Date;

  /**
   * Current version of the referral for optimistic concurrency control.
   * Must match the database version for the update to succeed.
   */
  @ApiProperty({
    description: 'Current referral version for optimistic concurrency control',
    example: 1,
  })
  @IsInt()
  version: number;

  /**
   * Optional metadata for status-specific information.
   * Can include context like contact attempts, follow-up actions, etc.
   */
  @ApiPropertyOptional({
    description: 'Supplemental operational metadata',
    example: { contactAttempts: 2 },
  })
  @IsOptional()
  metadata?: Record<string, any>;
}

/**
 * Helper function to validate that required fields are present for specific work statuses.
 * Used by the WorkflowService to perform additional validation beyond DTO validation.
 * 
 * @param dto The UpdateWorkStatusDto to validate
 * @returns Array of validation error messages (empty if valid)
 */
export function validateWorkStatusRequirements(
  dto: UpdateWorkStatusDto,
): string[] {
  const errors: string[] = [];

  // BLOCKED_NEEDS_INFO requires reason
  if (
    dto.workStatus === WorkStatus.BLOCKED_NEEDS_INFO &&
    (!dto.reason || dto.reason.trim().length === 0)
  ) {
    errors.push(
      'Reason is required when setting work status to BLOCKED_NEEDS_INFO',
    );
  }

  // ON_HOLD requires both reason and nextReviewDate
  if (dto.workStatus === WorkStatus.ON_HOLD) {
    if (!dto.reason || dto.reason.trim().length === 0) {
      errors.push('Reason is required when setting work status to ON_HOLD');
    }
    if (!dto.nextReviewDate) {
      errors.push(
        'Next review date is required when setting work status to ON_HOLD',
      );
    } else if (dto.nextReviewDate <= new Date()) {
      errors.push('Next review date must be in the future');
    }
  }

  return errors;
}
