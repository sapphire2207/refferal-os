import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { PipelineStage } from '@heals/types';
import { Referral } from '@prisma/client';

/**
 * GatewayCheckService
 * 
 * Validates stage-specific gateway requirements before stage transitions.
 * 
 * Gateway checks enforce business rules for each transition type:
 * - IntakeComplete: Required fields, coverage verification
 * - ClinicalAccept: ClinicalReview record with ACCEPT decision exists
 * - AppointmentConfirmed: Confirmed appointment with assigned NP
 * - VisitComplete: Completed encounter with submitted clinical note
 * - NoteApproved: NoteReview with APPROVE decision for active note revision
 * 
 * This service implements the gateway validation component of Property 2
 * (Transition Validation) from the design document.
 * 
 * @see Design: Workflow Gates section
 * @see Requirements: 1.4, 2.2, 2.3, 3.6, 4.2, 5.2, 6.4
 */
@Injectable()
export class GatewayCheckService {
  private readonly logger = new Logger(GatewayCheckService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Checks all required fields for a specific pipeline stage are present.
   * 
   * Validates that the referral has all mandatory fields populated per
   * REQUIRED_FIELDS_PER_STAGE configuration before allowing transition
   * out of the current stage.
   * 
   * @param referral - The referral being validated
   * @param stage - The pipeline stage to validate fields for
   * @returns Promise<ValidationResult> - Success or errors listing missing fields
   * 
   * @see Requirement 1.4: Required fields validation per REQUIRED_FIELDS_PER_STAGE
   * @see Requirement 2.2: Required fields for INTAKE→CLINICAL_REVIEW
   * @see Design: REQUIRED_FIELDS_PER_STAGE constant
   */
  async checkRequiredFields(
    referral: Referral,
    stage: PipelineStage,
  ): Promise<ValidationResult> {
    this.logger.debug(`Checking required fields for stage: ${stage}`);
    
    const errors: ValidationError[] = [];
    
    // Import REQUIRED_FIELDS_PER_STAGE at runtime to avoid circular dependencies
    const { REQUIRED_FIELDS_PER_STAGE } = await import('../constants/workflow.constants');
    
    // Look up required fields for this stage
    const requiredFields = REQUIRED_FIELDS_PER_STAGE[stage];
    
    if (!requiredFields || requiredFields.length === 0) {
      // No required fields for this stage, validation passes
      return { valid: true, errors: [] };
    }
    
    // Check each required field
    for (const fieldName of requiredFields) {
      // Handle special fields that require related record validation
      if (this.isRelatedRecordField(fieldName)) {
        // Related record fields will be validated by specific gate checks
        // This method only validates direct referral fields
        continue;
      }
      
      // Check direct referral fields
      const fieldValue = referral[fieldName as keyof Referral];
      
      // Field is missing or null
      if (fieldValue === null || fieldValue === undefined) {
        errors.push({
          type: 'gate',
          field: fieldName,
          message: `Required field '${fieldName}' is missing`,
          details: { stage, requiredField: fieldName },
        });
        continue;
      }
      
      // Special validation for boolean fields (must be true)
      if (fieldName === 'coverageVerified' && typeof fieldValue === 'boolean' && !fieldValue) {
        errors.push({
          type: 'gate',
          field: fieldName,
          message: 'Coverage verification is required before clinical review',
          details: { stage, requiredField: fieldName, currentValue: fieldValue },
        });
      }
    }
    
    // Return validation result
    const valid = errors.length === 0;
    
    if (!valid) {
      this.logger.warn(
        `Required fields validation failed for stage ${stage}: ${errors.length} missing fields`,
      );
    } else {
      this.logger.debug(`All required fields present for stage ${stage}`);
    }
    
    return { valid, errors };
  }
  
  /**
   * Determines if a field name represents a related record check.
   * 
   * Related record fields are validated by specific gate checks
   * (e.g., checkClinicalAccept, checkAppointmentConfirmed).
   * 
   * @param fieldName - The field name to check
   * @returns boolean - True if this is a related record field
   */
  private isRelatedRecordField(fieldName: string): boolean {
    const relatedRecordFields = [
      'clinicalReviewDecision',
      'appointmentScheduled',
      'appointmentConfirmed',
      'nursePractitionerAssigned',
      'encounterComplete',
      'clinicalNoteSubmitted',
      'noteReviewApproval',
      'billingReady',
    ];
    
    return relatedRecordFields.includes(fieldName);
  }

  /**
   * Validates IntakeComplete gate requirements.
   * 
   * Checks that all intake prerequisites are satisfied:
   * - Required fields: patientId, referralSource, insurancePayer, site, state
   * - Business rule: coverageVerified must be true
   * 
   * @param referral - The referral being validated
   * @returns Promise<ValidationResult> - Success or errors describing gate failures
   * 
   * @see Requirement 2.2: Required fields verification for INTAKE→CLINICAL_REVIEW
   * @see Requirement 2.3: Coverage verification blocking transition when false
   * @see Design: IntakeComplete Gate
   */
  async checkIntakeComplete(referral: Referral): Promise<ValidationResult> {
    this.logger.debug(`Checking IntakeComplete gate for referral ${referral.id}`);
    
    const errors: ValidationError[] = [];

    // Check required fields per Requirement 2.2
    const requiredFields: Array<{ field: keyof Referral; label: string }> = [
      { field: 'patientId', label: 'Patient' },
      { field: 'referralSource', label: 'Referral Source' },
      { field: 'insurancePayer', label: 'Insurance Payer' },
      { field: 'site', label: 'Site' },
      { field: 'state', label: 'State' },
    ];

    for (const { field, label } of requiredFields) {
      if (!referral[field]) {
        errors.push({
          type: 'gate',
          field,
          message: `${label} is required before transitioning to clinical review`,
        });
      }
    }

    // Check coverage verification per Requirement 2.3
    if (!referral.coverageVerified) {
      errors.push({
        type: 'gate',
        field: 'coverageVerified',
        message: 'Coverage verification is required before clinical review',
      });
    }

    const valid = errors.length === 0;
    
    if (valid) {
      this.logger.debug(`IntakeComplete gate passed for referral ${referral.id}`);
    } else {
      this.logger.debug(
        `IntakeComplete gate failed for referral ${referral.id}: ${errors.length} error(s)`,
      );
    }

    return { valid, errors };
  }

  /**
   * Validates ClinicalAccept gate requirements.
   * 
   * Checks that a ClinicalReview record exists with decision=ACCEPT for the
   * current review cycle before allowing transition to SCHEDULING.
   * 
   * @param referral - The referral being validated
   * @returns Promise<ValidationResult> - Success or error if review missing/invalid
   * 
   * @see Requirement 3.6: ClinicalReview record verification before SCHEDULING transition
   * @see Design: ClinicalAccept Gate
   */
  async checkClinicalAccept(referral: Referral): Promise<ValidationResult> {
    this.logger.debug(`Checking ClinicalAccept gate for referral ${referral.id}`);
    
    // TODO: Implement clinical acceptance validation
    // - Query ClinicalReview table for referral
    // - Verify ACCEPT decision exists for current cycle
    // - Return validation result
    
    throw new Error('Method not implemented');
  }

  /**
   * Validates AppointmentConfirmed gate requirements.
   * 
   * Checks that an Appointment record exists with:
   * - confirmedAt timestamp populated
   * - Valid assigned nurse practitioner with proper role and scope
   * 
   * @param referral - The referral being validated
   * @returns Promise<ValidationResult> - Success or error if appointment not confirmed
   * 
   * @see Requirement 4.2: Appointment record verification before NP_VISIT transition
   * @see Design: AppointmentConfirmed Gate
   */
  async checkAppointmentConfirmed(
    referral: Referral,
  ): Promise<ValidationResult> {
    this.logger.debug(`Checking AppointmentConfirmed gate for referral ${referral.id}`);
    
    // TODO: Implement appointment confirmation validation
    // - Query Appointment table for referral
    // - Verify confirmedAt is populated
    // - Verify nursePractitionerId is assigned
    // - Optionally verify NP has valid role and scope
    // - Return validation result
    
    throw new Error('Method not implemented');
  }

  /**
   * Validates VisitComplete gate requirements.
   * 
   * Checks that the clinical visit is properly documented:
   * - Encounter record exists with outcome=COMPLETED
   * - dateOfService is present
   * - ClinicalNote exists with submittedAt populated
   * - servicesProvided array is non-empty
   * 
   * @param referral - The referral being validated
   * @returns Promise<ValidationResult> - Success or errors listing missing documentation
   * 
   * @see Requirement 5.2: Encounter and clinical note verification before NOTES_QA
   * @see Design: VisitComplete Gate
   */
  async checkVisitComplete(referral: Referral): Promise<ValidationResult> {
    this.logger.debug(`Checking VisitComplete gate for referral ${referral.id}`);
    
    // TODO: Implement visit completion validation
    // - Query Encounter table for referral
    // - Verify outcome is COMPLETED
    // - Verify dateOfService is present
    // - Query ClinicalNote table for referral
    // - Verify submittedAt is populated
    // - Verify servicesProvided is non-empty
    // - Return validation result
    
    throw new Error('Method not implemented');
  }

  /**
   * Validates NoteApproved gate requirements.
   * 
   * Checks that the clinical note has been approved for billing:
   * - NoteReview record exists with decision=APPROVE for active note revision
   * - billingStatus is READY (set by note approval)
   * 
   * @param referral - The referral being validated
   * @returns Promise<ValidationResult> - Success or error if note not approved
   * 
   * @see Requirement 6.4: Note approval verification before BILLING transition
   * @see Design: NoteApproved Gate
   */
  async checkNoteApproved(referral: Referral): Promise<ValidationResult> {
    this.logger.debug(`Checking NoteApproved gate for referral ${referral.id}`);
    
    // TODO: Implement note approval validation
    // - Query NoteReview table for active clinical note
    // - Verify APPROVE decision exists
    // - Verify billingStatus is READY
    // - Return validation result
    
    throw new Error('Method not implemented');
  }

  /**
   * Orchestrates all gateway checks for a specific transition.
   * 
   * Determines which gate checks apply based on the target stage and
   * executes them, accumulating all validation errors.
   * 
   * @param context - Validation context with referral, target stage, user, etc.
   * @returns Promise<ValidationResult> - Aggregated result of all applicable gates
   * 
   * @see Design: Workflow Gates section
   * @see Design: Stage Transition Matrix
   */
  async checkGatesForTransition(
    context: ValidationContext,
  ): Promise<ValidationResult> {
    this.logger.debug(
      `Checking gates for transition to ${context.targetStage} for referral ${context.referral.id}`,
    );
    
    // TODO: Implement gate orchestration logic
    // - Determine which gates apply for the target stage
    // - Execute applicable gate checks
    // - Accumulate validation errors
    // - Return combined validation result
    
    throw new Error('Method not implemented');
  }
}

/**
 * ValidationContext interface
 * 
 * Provides all information needed for gateway validation checks.
 */
export interface ValidationContext {
  referral: Referral;
  targetStage: PipelineStage;
  user: any;  // Will use AuthTokenPayload when available
  reason?: string;
  metadata?: Record<string, any>;
}

/**
 * ValidationResult interface
 * 
 * Represents the outcome of a validation check with detailed error information.
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * ValidationError interface
 * 
 * Provides structured error information for validation failures.
 */
export interface ValidationError {
  type: 'permission' | 'scope' | 'gate' | 'transition' | 'version';
  field?: string;
  message: string;
  details?: Record<string, any>;
}
