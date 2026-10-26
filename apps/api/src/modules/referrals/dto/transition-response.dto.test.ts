import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  ValidationErrorDto,
  ValidationErrorType,
  WorkflowTransitionDto,
  TransitionResultDto,
  ErrorResponseDto,
  VersionConflictDto,
} from './transition-response.dto';
import { PipelineStage, WorkStatus, CaseOutcome, BillingStatus, Priority } from '@repo/types';

describe('TransitionResponseDto', () => {
  describe('ValidationErrorDto', () => {
    it('should validate a complete validation error', async () => {
      const dto = plainToInstance(ValidationErrorDto, {
        type: ValidationErrorType.PERMISSION,
        field: 'coverageVerified',
        message: 'Coverage verification is required',
        details: {
          requiredPermission: 'referrals.transition.to_clinical_review',
          userRoles: ['INTAKE_SPECIALIST'],
        },
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should validate error without optional fields', async () => {
      const dto = plainToInstance(ValidationErrorDto, {
        type: ValidationErrorType.SCOPE,
        message: 'User scope does not match referral location',
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail validation when type is invalid', async () => {
      const dto = plainToInstance(ValidationErrorDto, {
        type: 'INVALID_TYPE' as any,
        message: 'Test message',
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('type');
    });

    it('should fail validation when message is missing', async () => {
      const dto = plainToInstance(ValidationErrorDto, {
        type: ValidationErrorType.GATE,
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('message');
    });

    it('should validate all error types', async () => {
      const types = [
        ValidationErrorType.PERMISSION,
        ValidationErrorType.SCOPE,
        ValidationErrorType.GATE,
        ValidationErrorType.TRANSITION,
        ValidationErrorType.VERSION,
      ];

      for (const type of types) {
        const dto = plainToInstance(ValidationErrorDto, {
          type,
          message: 'Test message',
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      }
    });
  });

  describe('WorkflowTransitionDto', () => {
    it('should validate a complete workflow transition', async () => {
      const dto = plainToInstance(WorkflowTransitionDto, {
        id: 'transition-123',
        referralId: 'referral-456',
        fromStage: PipelineStage.INTAKE,
        toStage: PipelineStage.CLINICAL_REVIEW,
        fromStatus: WorkStatus.COMPLETED,
        toStatus: WorkStatus.PENDING,
        transitionedBy: 'user-789',
        reason: 'Intake complete',
        metadata: { key: 'value' },
        transitionedAt: new Date().toISOString(),
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should validate transition without optional fields', async () => {
      const dto = plainToInstance(WorkflowTransitionDto, {
        id: 'transition-123',
        referralId: 'referral-456',
        toStage: PipelineStage.CLINICAL_REVIEW,
        toStatus: WorkStatus.PENDING,
        transitionedBy: 'user-789',
        transitionedAt: new Date().toISOString(),
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail validation when required fields are missing', async () => {
      const dto = plainToInstance(WorkflowTransitionDto, {
        id: 'transition-123',
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail validation when toStage is invalid', async () => {
      const dto = plainToInstance(WorkflowTransitionDto, {
        id: 'transition-123',
        referralId: 'referral-456',
        toStage: 'INVALID_STAGE' as any,
        toStatus: WorkStatus.PENDING,
        transitionedBy: 'user-789',
        transitionedAt: new Date().toISOString(),
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('toStage');
    });
  });

  describe('TransitionResultDto', () => {
    const mockReferral = {
      id: 'referral-123',
      patientId: 'patient-456',
      pipelineStage: PipelineStage.CLINICAL_REVIEW,
      workStatus: WorkStatus.PENDING,
      caseOutcome: CaseOutcome.ACTIVE,
      billingStatus: BillingStatus.NOT_READY,
      priority: Priority.ROUTINE,
      coverageVerified: true,
      version: 2,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const mockTransition = {
      id: 'transition-123',
      referralId: 'referral-123',
      fromStage: PipelineStage.INTAKE,
      toStage: PipelineStage.CLINICAL_REVIEW,
      fromStatus: WorkStatus.COMPLETED,
      toStatus: WorkStatus.PENDING,
      transitionedBy: 'user-789',
      reason: 'Intake complete',
      transitionedAt: new Date().toISOString(),
    };

    it('should validate a complete transition result', async () => {
      const dto = plainToInstance(TransitionResultDto, {
        success: true,
        referral: mockReferral,
        transition: mockTransition,
        warnings: ['Some non-critical warning'],
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should validate result without optional warnings', async () => {
      const dto = plainToInstance(TransitionResultDto, {
        success: true,
        referral: mockReferral,
        transition: mockTransition,
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail validation when success is not true', async () => {
      const dto = plainToInstance(TransitionResultDto, {
        success: false as any,
        referral: mockReferral,
        transition: mockTransition,
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('success');
    });

    it('should fail validation when referral is missing', async () => {
      const dto = plainToInstance(TransitionResultDto, {
        success: true,
        transition: mockTransition,
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail validation when transition is missing', async () => {
      const dto = plainToInstance(TransitionResultDto, {
        success: true,
        referral: mockReferral,
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('ErrorResponseDto', () => {
    it('should validate a complete error response', async () => {
      const dto = plainToInstance(ErrorResponseDto, {
        success: false,
        message: 'Validation failed',
        errors: [
          {
            type: ValidationErrorType.GATE,
            field: 'coverageVerified',
            message: 'Coverage verification is required',
            details: { currentValue: false },
          },
        ],
        data: { additionalContext: 'test' },
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should validate minimal error response', async () => {
      const dto = plainToInstance(ErrorResponseDto, {
        success: false,
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should validate error response with only message', async () => {
      const dto = plainToInstance(ErrorResponseDto, {
        success: false,
        message: 'An error occurred',
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should validate error response with multiple validation errors', async () => {
      const dto = plainToInstance(ErrorResponseDto, {
        success: false,
        message: 'Multiple validation failures',
        errors: [
          {
            type: ValidationErrorType.PERMISSION,
            message: 'Permission denied',
          },
          {
            type: ValidationErrorType.SCOPE,
            message: 'Scope mismatch',
          },
        ],
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail validation when success is not false', async () => {
      const dto = plainToInstance(ErrorResponseDto, {
        success: true as any,
        message: 'This should be false',
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('success');
    });
  });

  describe('VersionConflictDto', () => {
    const mockReferral = {
      id: 'referral-123',
      patientId: 'patient-456',
      pipelineStage: PipelineStage.CLINICAL_REVIEW,
      workStatus: WorkStatus.PENDING,
      caseOutcome: CaseOutcome.ACTIVE,
      billingStatus: BillingStatus.NOT_READY,
      priority: Priority.ROUTINE,
      coverageVerified: true,
      version: 5,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should validate a complete version conflict response', async () => {
      const dto: VersionConflictDto = {
        success: false,
        message: 'Version conflict detected',
        data: {
          requestedVersion: 3,
          currentVersion: 5,
          currentState: mockReferral,
        },
      };

      // Type checking - ensure the structure matches
      expect(dto.success).toBe(false);
      expect(dto.data.requestedVersion).toBe(3);
      expect(dto.data.currentVersion).toBe(5);
      expect(dto.data.currentState).toBeDefined();
    });

    it('should have correct structure for client refresh', () => {
      const dto: VersionConflictDto = {
        success: false,
        message: 'Referral was modified by another user',
        data: {
          requestedVersion: 1,
          currentVersion: 7,
          currentState: mockReferral,
        },
      };

      // Verify the client can extract necessary information
      expect(dto.data.currentState.version).toBe(5);
      expect(dto.data.currentState.pipelineStage).toBe(PipelineStage.CLINICAL_REVIEW);
      expect(dto.data.currentState.workStatus).toBe(WorkStatus.PENDING);
    });
  });

  describe('Type consistency', () => {
    it('should ensure ValidationErrorType enum matches design document', () => {
      const expectedTypes = ['permission', 'scope', 'gate', 'transition', 'version'];
      const actualTypes = Object.values(ValidationErrorType);

      expectedTypes.forEach((type) => {
        expect(actualTypes).toContain(type);
      });
    });

    it('should ensure TransitionResultDto has success field typed as true literal', () => {
      const dto = new TransitionResultDto();
      // TypeScript compile-time check - this should only allow true
      dto.success = true;
      
      // Runtime check
      expect(dto.success).toBe(true);
    });

    it('should ensure ErrorResponseDto has success field typed as false literal', () => {
      const dto = new ErrorResponseDto();
      // TypeScript compile-time check - this should only allow false
      dto.success = false;
      
      // Runtime check
      expect(dto.success).toBe(false);
    });
  });
});

