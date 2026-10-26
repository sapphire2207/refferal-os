import {
  IsOptional,
  IsString,
  IsEnum,
  IsUUID,
  ValidateIf,
  MinLength,
} from 'class-validator';
import { UserRole } from '@repo/types';

/**
 * DTO for requesting assignment or reassignment of a referral.
 * 
 * This DTO validates assignment requests before they reach the WorkflowService.
 * It supports two assignment modes:
 * 1. User-specific assignment: Assign to a specific user by userId
 * 2. Role queue assignment: Assign to a role queue (no specific user)
 * 
 * Requirements:
 * - 9.3: Assignment to specific user with verification
 * - 9.4: Assignment with creation of ReferralAssignment record
 * - 9.5: Reassignment with closure of previous assignment
 */
export class AssignmentRequestDto {
  /**
   * User ID to assign the referral to.
   * 
   * When provided:
   * - User must have the required role for the referral's current stage
   * - User must have scope access to the referral's location (site, state, legal entity)
   * - Creates a ReferralAssignment record with userId populated
   * - Sets referral.assignedTo to the userId
   * 
   * When omitted:
   * - Role must be provided instead
   * - Assigns to role queue (no specific user)
   * - Clears referral.assignedTo field
   */
  @IsOptional()
  @IsUUID('4', {
    message: 'userId must be a valid UUID',
  })
  userId?: string;

  /**
   * Role to assign the referral to (for role queue assignment).
   * 
   * REQUIRED when userId is not provided.
   * 
   * When provided without userId:
   * - Assigns referral to the role queue
   * - Sets referral.assignedRole to the specified role
   * - Clears referral.assignedTo (no specific user)
   * - Creates ReferralAssignment record without userId
   * 
   * When provided with userId:
   * - Validates that the user has this role
   * - Sets both assignedTo and assignedRole
   */
  @IsOptional()
  @IsEnum(UserRole, {
    message: 'role must be a valid user role',
  })
  role?: UserRole;

  /**
   * Reason for the assignment or reassignment.
   * 
   * REQUIRED for all assignment operations.
   * 
   * Examples:
   * - "Initial assignment to intake specialist"
   * - "Reassigning due to reviewer unavailability"
   * - "Returning to original nurse practitioner for note correction"
   * - "Workload balancing"
   * 
   * This reason is recorded in the ReferralAssignment record and audit trail.
   */
  @IsString()
  @MinLength(10, {
    message: 'Reason must be at least 10 characters',
  })
  reason: string;

  /**
   * Optional metadata for assignment-specific information.
   * Can include context like previous assignee, assignment priority, etc.
   */
  @IsOptional()
  metadata?: Record<string, any>;
}

/**
 * Helper function to validate assignment request requirements.
 * Used by the WorkflowService to perform additional validation beyond DTO validation.
 * 
 * @param dto The AssignmentRequestDto to validate
 * @returns Array of validation error messages (empty if valid)
 */
export function validateAssignmentRequirements(
  dto: AssignmentRequestDto,
): string[] {
  const errors: string[] = [];

  // At least one of userId or role must be provided
  if (!dto.userId && !dto.role) {
    errors.push(
      'Either userId or role must be provided for assignment',
    );
  }

  // Reason is always required and enforced by validation decorators,
  // but we double-check for empty strings
  if (!dto.reason || dto.reason.trim().length === 0) {
    errors.push('Reason is required and cannot be empty');
  }

  // Validate reason length
  if (dto.reason && dto.reason.trim().length < 10) {
    errors.push('Reason must be at least 10 characters long');
  }

  return errors;
}

/**
 * Response DTO for assignment operations.
 * 
 * Contains the updated referral and assignment details.
 */
export interface AssignmentResultDto {
  /**
   * Whether the assignment was successful
   */
  success: boolean;

  /**
   * The updated referral with new assignment
   */
  referral: {
    id: string;
    assignedTo?: string;
    assignedRole?: UserRole;
    updatedAt: Date;
  };

  /**
   * The created ReferralAssignment record
   */
  assignment: {
    id: string;
    referralId: string;
    userId?: string;
    role?: UserRole;
    assignedAt: Date;
    assignedBy: string;
    reason: string;
  };

  /**
   * Optional warnings (e.g., "Previous assignment was not closed")
   */
  warnings?: string[];
}

