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
    
    const errors: ValidationError[] = [];
    
    // Query for ClinicalReview record with decision=ACCEPT
    const clinicalReview = await this.prisma.clinicalReview.findFirst({
      where: {
        referralId: referral.id,
        decision: 'ACCEPT',
      },
      orderBy: {
        reviewedAt: 'desc',
      },
    });
    
    // Check if an ACCEPT decision exists
    if (!clinicalReview) {
      errors.push({
        type: 'gate',
        message: 'Clinical review with ACCEPT decision is required before transitioning to SCHEDULING',
        details: {
          gate: 'ClinicalAccept',
          referralId: referral.id,
        },
      });
    }
    
    return {
      valid: errors.length === 0,
      errors,
    };
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
   * @see Requirement 4.3: Nurse practitioner role and scope validation
   * @see Design: AppointmentConfirmed Gate
   */
  async checkAppointmentConfirmed(
    referral: Referral,
  ): Promise<ValidationResult> {
    this.logger.debug(`Checking AppointmentConfirmed gate for referral ${referral.id}`);
    
    const errors: ValidationError[] = [];
    
    // Query for the most recent non-cancelled appointment
    const appointment = await this.prisma.appointment.findFirst({
      where: {
        referralId: referral.id,
        cancelledAt: null,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    
    // Check if appointment exists
    if (!appointment) {
      errors.push({
        type: 'gate',
        message: 'Appointment must be scheduled and confirmed',
        details: { gate: 'AppointmentConfirmed' },
      });
      return { valid: false, errors };
    }
    
    // Check if appointment is confirmed
    if (!appointment.confirmedAt) {
      errors.push({
        type: 'gate',
        field: 'confirmedAt',
        message: 'Appointment must be confirmed before transitioning to NP_VISIT',
        details: { 
          gate: 'AppointmentConfirmed',
          appointmentId: appointment.id,
        },
      });
    }
    
    // Check if nurse practitioner is assigned
    if (!appointment.nursePractitionerId) {
      errors.push({
        type: 'gate',
        field: 'nursePractitionerId',
        message: 'Appointment must have an assigned nurse practitioner',
        details: { 
          gate: 'AppointmentConfirmed',
          appointmentId: appointment.id,
        },
      });
      return { valid: false, errors };
    }
    
    // Validate nurse practitioner has NURSE_PRACTITIONER role (Requirement 4.3)
    const npUser = await this.prisma.user.findUnique({
      where: { id: appointment.nursePractitionerId },
      include: {
        userRoles: true,
        userScopes: true,
      },
    });
    
    if (!npUser) {
      errors.push({
        type: 'gate',
        field: 'nursePractitionerId',
        message: 'Assigned nurse practitioner not found',
        details: { 
          gate: 'AppointmentConfirmed',
          nursePractitionerId: appointment.nursePractitionerId,
        },
      });
      return { valid: false, errors };
    }
    
    // Verify NP has NURSE_PRACTITIONER role
    const hasNpRole = npUser.userRoles.some(
      (role) => role.role === 'NURSE_PRACTITIONER'
    );
    
    if (!hasNpRole) {
      errors.push({
        type: 'gate',
        field: 'nursePractitionerId',
        message: 'Assigned user does not have NURSE_PRACTITIONER role',
        details: { 
          gate: 'AppointmentConfirmed',
          nursePractitionerId: appointment.nursePractitionerId,
          userName: `${npUser.firstName} ${npUser.lastName}`,
        },
      });
    }
    
    // Validate nurse practitioner has appropriate site scope (Requirement 4.3)
    if (referral.site) {
      const hasMatchingScope = npUser.userScopes.some(
        (scope) => scope.site === null || scope.site === referral.site
      );
      
      if (!hasMatchingScope) {
        errors.push({
          type: 'scope',
          field: 'nursePractitionerId',
          message: 'Assigned nurse practitioner does not have access to referral site',
          details: { 
            gate: 'AppointmentConfirmed',
            nursePractitionerId: appointment.nursePractitionerId,
            referralSite: referral.site,
            userName: `${npUser.firstName} ${npUser.lastName}`,
          },
        });
      }
    }
    
    // Check if NP is active
    if (!npUser.isActive) {
      errors.push({
        type: 'gate',
        field: 'nursePractitionerId',
        message: 'Assigned nurse practitioner is not active',
        details: { 
          gate: 'AppointmentConfirmed',
          nursePractitionerId: appointment.nursePractitionerId,
          userName: `${npUser.firstName} ${npUser.lastName}`,
        },
      });
    }
    
    return {
      valid: errors.length === 0,
      errors,
    };
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
    
    const errors: ValidationError[] = [];

    // Query for Encounter with outcome=COMPLETED
    const encounter = await this.prisma.encounter.findFirst({
      where: {
        referralId: referral.id,
        outcome: 'COMPLETED',
      },
    });

    if (!encounter) {
      errors.push({
        type: 'gate',
        field: 'encounter',
        message: 'Encounter record with outcome COMPLETED is required',
      });
      
      // Return early if no encounter - can't check other fields
      return {
        valid: false,
        errors,
      };
    }

    // Check dateOfService is present
    if (!encounter.dateOfService) {
      errors.push({
        type: 'gate',
        field: 'dateOfService',
        message: 'Date of service is required',
      });
    }

    // Check servicesProvided is non-empty
    if (!encounter.servicesProvided || encounter.servicesProvided.length === 0) {
      errors.push({
        type: 'gate',
        field: 'servicesProvided',
        message: 'At least one service provided is required',
      });
    }

    // Query for ClinicalNote with submittedAt populated
    const clinicalNote = await this.prisma.clinicalNote.findFirst({
      where: {
        referralId: referral.id,
        encounterId: encounter.id,
        submittedAt: {
          not: null,
        },
      },
    });

    if (!clinicalNote) {
      errors.push({
        type: 'gate',
        field: 'clinicalNote',
        message: 'Clinical note must be submitted before quality review',
      });
    }

    return {
      valid: errors.length === 0,
      errors,
    };
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
    
    const errors: ValidationError[] = [];

    // 1. Check billingStatus is READY (Requirement 6.4)
    if (referral.billingStatus !== 'READY') {
      errors.push({
        type: 'gate',
        field: 'billingStatus',
        message: 'Billing status must be READY before transitioning to BILLING',
        details: {
          gate: 'NoteApproved',
          currentBillingStatus: referral.billingStatus,
        },
      });
    }

    // 2. Query for the most recent submitted clinical note for this referral (active revision)
    const activeNote = await this.prisma.clinicalNote.findFirst({
      where: {
        referralId: referral.id,
        submittedAt: {
          not: null,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!activeNote) {
      errors.push({
        type: 'gate',
        field: 'clinicalNote',
        message: 'Submitted clinical note is required before transitioning to BILLING',
        details: { gate: 'NoteApproved', referralId: referral.id },
      });
      return { valid: false, errors };
    }

    // 3. Query for NoteReview with decision=APPROVE for this active clinical note
    const approvedReview = await this.prisma.noteReview.findFirst({
      where: {
        clinicalNoteId: activeNote.id,
        decision: 'APPROVE',
      },
      orderBy: {
        reviewedAt: 'desc',
      },
    });

    if (!approvedReview) {
      errors.push({
        type: 'gate',
        field: 'noteReview',
        message: 'Clinical note must be approved before transitioning to BILLING',
        details: {
          gate: 'NoteApproved',
          clinicalNoteId: activeNote.id,
          referralId: referral.id,
        },
      });
    }

    const valid = errors.length === 0;
    if (valid) {
      this.logger.debug(`NoteApproved gate passed for referral ${referral.id}`);
    } else {
      this.logger.debug(
        `NoteApproved gate failed for referral ${referral.id}: ${errors.length} error(s)`,
      );
    }

    return { valid, errors };
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
    
    const errors: ValidationError[] = [];

    const stageOrder: Record<PipelineStage, number> = {
      [PipelineStage.INTAKE]: 1,
      [PipelineStage.CLINICAL_REVIEW]: 2,
      [PipelineStage.SCHEDULING]: 3,
      [PipelineStage.NP_VISIT]: 4,
      [PipelineStage.NOTES_QA]: 5,
      [PipelineStage.BILLING]: 6,
    };

    const currentOrder = stageOrder[context.referral.pipelineStage as unknown as PipelineStage];
    const targetOrder = stageOrder[context.targetStage];
    const isBackward = targetOrder < currentOrder;

    if (isBackward) {
      // Backward transitions require a documented reason (Requirements 3.3, 6.3, 12.2)
      if (!context.reason || context.reason.trim().length === 0) {
        errors.push({
          type: 'gate',
          field: 'reason',
          message: `Reason is required for backward transition to ${context.targetStage}`,
          details: {
            fromStage: context.referral.pipelineStage,
            toStage: context.targetStage,
          },
        });
      }
    } else {
      // Forward transition: validate required fields for the current stage
      const requiredFieldsResult = await this.checkRequiredFields(
        context.referral,
        context.referral.pipelineStage as unknown as PipelineStage,
      );
      errors.push(...requiredFieldsResult.errors);

      // Execute stage-specific gate checks based on target stage
      let gateResult: ValidationResult | null = null;

      switch (context.targetStage) {
        case PipelineStage.CLINICAL_REVIEW:
          gateResult = await this.checkIntakeComplete(context.referral);
          break;
        case PipelineStage.SCHEDULING:
          gateResult = await this.checkClinicalAccept(context.referral);
          break;
        case PipelineStage.NP_VISIT:
          gateResult = await this.checkAppointmentConfirmed(context.referral);
          break;
        case PipelineStage.NOTES_QA:
          gateResult = await this.checkVisitComplete(context.referral);
          break;
        case PipelineStage.BILLING:
          gateResult = await this.checkNoteApproved(context.referral);
          break;
      }

      if (gateResult) {
        errors.push(...gateResult.errors);
      }
    }

    // Deduplicate any overlapping errors (e.g. from requiredFields and gate checks)
    const seenErrors = new Set<string>();
    const uniqueErrors: ValidationError[] = [];

    for (const err of errors) {
      const key = `${err.type}:${err.field || ''}:${err.message}`;
      if (!seenErrors.has(key)) {
        seenErrors.add(key);
        uniqueErrors.push(err);
      }
    }

    return {
      valid: uniqueErrors.length === 0,
      errors: uniqueErrors,
    };
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
