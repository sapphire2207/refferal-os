import { IsBoolean, IsString, IsOptional, IsEnum, IsObject, IsArray, IsInt, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PipelineStage, WorkStatus, Referral } from '@repo/types';

/**
 * Validation error types as defined in the design document.
 * These types categorize different validation failure scenarios.
 * 
 * Requirements: 13.1 - Structured error responses with error type, field, message, details
 */
export enum ValidationErrorType {
  PERMISSION = 'permission',
  SCOPE = 'scope',
  GATE = 'gate',
  TRANSITION = 'transition',
  VERSION = 'version',
}

/**
 * DTO representing a single validation error.
 * 
 * Provides detailed information about what validation failed, which field
 * was affected (if applicable), a human-readable message, and additional
 * context in the details object.
 * 
 * Requirements: 13.1 - Validation errors with field-level details
 */
export class ValidationErrorDto {
  /**
   * The category of validation error.
   * Helps clients understand what type of issue occurred.
   */
  @IsEnum(ValidationErrorType)
  type: ValidationErrorType;

  /**
   * The specific field that failed validation (if applicable).
   * May be undefined for errors not related to a specific field.
   */
  @IsOptional()
  @IsString()
  field?: string;

  /**
   * Human-readable error message suitable for display to users.
   */
  @IsString()
  message: string;

  /**
   * Additional context about the error.
   * May include current values, expected values, or other diagnostic information.
   */
  @IsOptional()
  @IsObject()
  details?: Record<string, any>;
}

/**
 * Workflow transition record returned with successful transitions.
 * 
 * Represents the immutable audit trail entry created for each state change.
 * Matches the WorkflowTransition schema from Prisma.
 * 
 * Requirements: 
 * - 1.8 - WorkflowTransition record creation with complete metadata
 * - 12.1 - Complete audit trail with all state change details
 */
export class WorkflowTransitionDto {
  /**
   * Unique identifier for the workflow transition record.
   */
  @IsString()
  id: string;

  /**
   * ID of the referral that transitioned.
   */
  @IsString()
  referralId: string;

  /**
   * Pipeline stage before the transition (may be null for initial creation).
   */
  @IsOptional()
  @IsEnum(PipelineStage)
  fromStage?: PipelineStage;

  /**
   * Pipeline stage after the transition.
   */
  @IsEnum(PipelineStage)
  toStage: PipelineStage;

  /**
   * Work status before the transition (may be null).
   */
  @IsOptional()
  @IsEnum(WorkStatus)
  fromStatus?: WorkStatus;

  /**
   * Work status after the transition.
   */
  @IsEnum(WorkStatus)
  toStatus: WorkStatus;

  /**
   * User ID of the person who performed the transition.
   */
  @IsString()
  transitionedBy: string;

  /**
   * Optional reason for the transition.
   * Required for backward transitions and certain workflow decisions.
   */
  @IsOptional()
  @IsString()
  reason?: string;

  /**
   * Additional metadata about the transition.
   * Can include contextual information specific to the transition type.
   */
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;

  /**
   * Timestamp when the transition occurred.
   */
  @IsString()
  transitionedAt: string;
}

/**
 * DTO representing a successful transition result.
 * 
 * Contains the updated referral entity and the audit record of the transition.
 * May include warnings for non-blocking issues that occurred during processing.
 * 
 * Requirements:
 * - 1.5 - Successful transition updates with version increment
 * - 1.8 - Workflow transition record included in response
 */
export class TransitionResultDto {
  /**
   * Indicates the transition was successful.
   * Always true for this DTO; failed transitions return ErrorResponseDto.
   */
  @IsBoolean()
  success: true;

  /**
   * The updated referral entity after the transition.
   * Includes incremented version and new stage/status values.
   */
  @IsObject()
  referral: Referral;

  /**
   * The workflow transition audit record created for this transition.
   */
  @ValidateNested()
  @Type(() => WorkflowTransitionDto)
  transition: WorkflowTransitionDto;

  /**
   * Optional array of warning messages for non-critical issues.
   * Warnings do not prevent the transition but may require attention.
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  warnings?: string[];
}

/**
 * DTO representing an error response for failed operations.
 * 
 * Used for validation failures, authorization errors, version conflicts,
 * and other error scenarios. Provides structured error information to
 * help clients understand what went wrong and how to recover.
 * 
 * Requirements: 13.1 - Structured error responses with actionable information
 */
export class ErrorResponseDto {
  /**
   * Indicates the operation failed.
   * Always false for this DTO.
   */
  @IsBoolean()
  success: false;

  /**
   * Optional high-level error message summarizing the failure.
   * Suitable for display to users.
   */
  @IsOptional()
  @IsString()
  message?: string;

  /**
   * Array of detailed validation errors.
   * Each error provides specific information about what validation failed.
   */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ValidationErrorDto)
  errors?: ValidationErrorDto[];

  /**
   * Additional context data for specific error types.
   * 
   * For version conflicts (409), includes:
   * - requestedVersion: The version provided in the request
   * - currentVersion: The actual current version in the database
   * - currentState: The current referral state for client refresh
   * 
   * For other error types, may include relevant context for debugging or recovery.
   */
  @IsOptional()
  @IsObject()
  data?: any;
}

/**
 * DTO for version conflict responses (HTTP 409).
 * 
 * Specialized error response that provides the current state of the referral
 * to enable intelligent client-side retry after refresh.
 * 
 * Requirements:
 * - 1.7 - Version conflict detection with current state
 * - 8.2 - Return current version and state on conflict
 */
export class VersionConflictDto extends ErrorResponseDto {
  /**
   * Always false for error responses.
   */
  success: false;

  /**
   * Error message indicating version conflict.
   */
  message: string;

  /**
   * Version conflict specific data.
   */
  data: {
    /**
     * The version number provided in the request.
     */
    requestedVersion: number;

    /**
     * The current version number in the database.
     */
    currentVersion: number;

    /**
     * The current state of the referral.
     * Allows the client to refresh and decide whether to retry.
     */
    currentState: Referral;
  };
}

