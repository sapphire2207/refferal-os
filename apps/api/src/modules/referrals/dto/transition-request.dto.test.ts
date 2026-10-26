import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { TransitionRequestDto } from './transition-request.dto';
import { PipelineStage } from '@heals/types';

describe('TransitionRequestDto', () => {
  describe('validation', () => {
    it('should validate a correct DTO', async () => {
      const dto = plainToInstance(TransitionRequestDto, {
        targetStage: PipelineStage.CLINICAL_REVIEW,
        reason: 'Intake complete',
        version: 1,
        metadata: { key: 'value' },
        idempotencyKey: 'test-key-123',
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should validate a minimal DTO with required fields only', async () => {
      const dto = plainToInstance(TransitionRequestDto, {
        targetStage: PipelineStage.SCHEDULING,
        version: 5,
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail validation when targetStage is missing', async () => {
      const dto = plainToInstance(TransitionRequestDto, {
        version: 1,
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('targetStage');
    });

    it('should fail validation when targetStage is invalid', async () => {
      const dto = plainToInstance(TransitionRequestDto, {
        targetStage: 'INVALID_STAGE',
        version: 1,
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('targetStage');
      expect(errors[0].constraints?.isEnum).toContain('valid pipeline stage');
    });

    it('should fail validation when version is missing', async () => {
      const dto = plainToInstance(TransitionRequestDto, {
        targetStage: PipelineStage.BILLING,
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('version');
    });

    it('should fail validation when version is not an integer', async () => {
      const dto = plainToInstance(TransitionRequestDto, {
        targetStage: PipelineStage.NP_VISIT,
        version: 1.5,
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('version');
    });

    it('should fail validation when version is a string', async () => {
      const dto = plainToInstance(TransitionRequestDto, {
        targetStage: PipelineStage.NOTES_QA,
        version: '1' as any,
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('version');
    });

    it('should allow optional reason field', async () => {
      const dto = plainToInstance(TransitionRequestDto, {
        targetStage: PipelineStage.CLINICAL_REVIEW,
        version: 1,
        reason: 'Coverage verified',
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail validation when reason is not a string', async () => {
      const dto = plainToInstance(TransitionRequestDto, {
        targetStage: PipelineStage.CLINICAL_REVIEW,
        version: 1,
        reason: 123 as any,
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('reason');
    });

    it('should allow optional metadata field', async () => {
      const dto = plainToInstance(TransitionRequestDto, {
        targetStage: PipelineStage.SCHEDULING,
        version: 2,
        metadata: {
          returnToOriginator: true,
          previousReviewer: 'user-123',
        },
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail validation when metadata is not an object', async () => {
      const dto = plainToInstance(TransitionRequestDto, {
        targetStage: PipelineStage.SCHEDULING,
        version: 2,
        metadata: 'not an object' as any,
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('metadata');
    });

    it('should allow optional idempotencyKey field', async () => {
      const dto = plainToInstance(TransitionRequestDto, {
        targetStage: PipelineStage.BILLING,
        version: 10,
        idempotencyKey: 'abc-123-def-456',
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail validation when idempotencyKey is not a string', async () => {
      const dto = plainToInstance(TransitionRequestDto, {
        targetStage: PipelineStage.BILLING,
        version: 10,
        idempotencyKey: 12345 as any,
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('idempotencyKey');
    });

    it('should validate all valid PipelineStage enum values', async () => {
      const stages = [
        PipelineStage.INTAKE,
        PipelineStage.CLINICAL_REVIEW,
        PipelineStage.SCHEDULING,
        PipelineStage.NP_VISIT,
        PipelineStage.NOTES_QA,
        PipelineStage.BILLING,
      ];

      for (const stage of stages) {
        const dto = plainToInstance(TransitionRequestDto, {
          targetStage: stage,
          version: 1,
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      }
    });
  });

  describe('field types', () => {
    it('should have correct types for all fields', () => {
      const dto = new TransitionRequestDto();
      dto.targetStage = PipelineStage.INTAKE;
      dto.version = 1;
      dto.reason = 'test reason';
      dto.metadata = { key: 'value' };
      dto.idempotencyKey = 'key-123';

      expect(typeof dto.targetStage).toBe('string');
      expect(typeof dto.version).toBe('number');
      expect(typeof dto.reason).toBe('string');
      expect(typeof dto.metadata).toBe('object');
      expect(typeof dto.idempotencyKey).toBe('string');
    });
  });
});
