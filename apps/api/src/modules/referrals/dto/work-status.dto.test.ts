import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  UpdateWorkStatusDto,
  validateWorkStatusRequirements,
} from './work-status.dto';
import { WorkStatus } from '@repo/types';

describe('UpdateWorkStatusDto', () => {
  describe('DTO Validation', () => {
    it('should accept valid work status update without reason for PENDING', async () => {
      const dto = plainToInstance(UpdateWorkStatusDto, {
        workStatus: WorkStatus.PENDING,
        version: 1,
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should accept valid work status update without reason for IN_PROGRESS', async () => {
      const dto = plainToInstance(UpdateWorkStatusDto, {
        workStatus: WorkStatus.IN_PROGRESS,
        version: 1,
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should accept valid work status update without reason for COMPLETED', async () => {
      const dto = plainToInstance(UpdateWorkStatusDto, {
        workStatus: WorkStatus.COMPLETED,
        version: 1,
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should require reason for BLOCKED_NEEDS_INFO', async () => {
      const dto = plainToInstance(UpdateWorkStatusDto, {
        workStatus: WorkStatus.BLOCKED_NEEDS_INFO,
        version: 1,
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('reason');
    });

    it('should accept BLOCKED_NEEDS_INFO with valid reason', async () => {
      const dto = plainToInstance(UpdateWorkStatusDto, {
        workStatus: WorkStatus.BLOCKED_NEEDS_INFO,
        reason: 'Waiting for updated insurance card from patient',
        version: 1,
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should reject BLOCKED_NEEDS_INFO with reason less than 10 characters', async () => {
      const dto = plainToInstance(UpdateWorkStatusDto, {
        workStatus: WorkStatus.BLOCKED_NEEDS_INFO,
        reason: 'Too short',
        version: 1,
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].constraints).toHaveProperty('minLength');
    });

    it('should require reason for ON_HOLD', async () => {
      const dto = plainToInstance(UpdateWorkStatusDto, {
        workStatus: WorkStatus.ON_HOLD,
        nextReviewDate: new Date(Date.now() + 86400000), // tomorrow
        version: 1,
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const reasonError = errors.find((e) => e.property === 'reason');
      expect(reasonError).toBeDefined();
    });

    it('should require nextReviewDate for ON_HOLD', async () => {
      const dto = plainToInstance(UpdateWorkStatusDto, {
        workStatus: WorkStatus.ON_HOLD,
        reason: 'Patient requested to postpone appointment',
        version: 1,
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const dateError = errors.find((e) => e.property === 'nextReviewDate');
      expect(dateError).toBeDefined();
    });

    it('should accept ON_HOLD with both reason and future nextReviewDate', async () => {
      const dto = plainToInstance(UpdateWorkStatusDto, {
        workStatus: WorkStatus.ON_HOLD,
        reason: 'Patient requested to postpone appointment',
        nextReviewDate: new Date(Date.now() + 86400000), // tomorrow
        version: 1,
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should require version field', async () => {
      const dto = plainToInstance(UpdateWorkStatusDto, {
        workStatus: WorkStatus.IN_PROGRESS,
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('version');
    });

    it('should accept optional metadata', async () => {
      const dto = plainToInstance(UpdateWorkStatusDto, {
        workStatus: WorkStatus.IN_PROGRESS,
        version: 1,
        metadata: { contactAttempts: 3, notes: 'Called patient 3 times' },
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
      expect(dto.metadata).toBeDefined();
    });
  });

  describe('validateWorkStatusRequirements', () => {
    it('should return empty array for valid IN_PROGRESS', () => {
      const dto: UpdateWorkStatusDto = {
        workStatus: WorkStatus.IN_PROGRESS,
        version: 1,
      };

      const errors = validateWorkStatusRequirements(dto);
      expect(errors).toHaveLength(0);
    });

    it('should return error when BLOCKED_NEEDS_INFO has no reason', () => {
      const dto: UpdateWorkStatusDto = {
        workStatus: WorkStatus.BLOCKED_NEEDS_INFO,
        version: 1,
      };

      const errors = validateWorkStatusRequirements(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain('BLOCKED_NEEDS_INFO');
    });

    it('should return error when BLOCKED_NEEDS_INFO has empty reason', () => {
      const dto: UpdateWorkStatusDto = {
        workStatus: WorkStatus.BLOCKED_NEEDS_INFO,
        reason: '   ',
        version: 1,
      };

      const errors = validateWorkStatusRequirements(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain('BLOCKED_NEEDS_INFO');
    });

    it('should return no error when BLOCKED_NEEDS_INFO has valid reason', () => {
      const dto: UpdateWorkStatusDto = {
        workStatus: WorkStatus.BLOCKED_NEEDS_INFO,
        reason: 'Waiting for patient insurance verification',
        version: 1,
      };

      const errors = validateWorkStatusRequirements(dto);
      expect(errors).toHaveLength(0);
    });

    it('should return error when ON_HOLD has no reason', () => {
      const dto: UpdateWorkStatusDto = {
        workStatus: WorkStatus.ON_HOLD,
        nextReviewDate: new Date(Date.now() + 86400000),
        version: 1,
      };

      const errors = validateWorkStatusRequirements(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.includes('Reason'))).toBe(true);
    });

    it('should return error when ON_HOLD has no nextReviewDate', () => {
      const dto: UpdateWorkStatusDto = {
        workStatus: WorkStatus.ON_HOLD,
        reason: 'Patient unavailable',
        version: 1,
      };

      const errors = validateWorkStatusRequirements(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.includes('Next review date'))).toBe(true);
    });

    it('should return error when ON_HOLD nextReviewDate is in the past', () => {
      const dto: UpdateWorkStatusDto = {
        workStatus: WorkStatus.ON_HOLD,
        reason: 'Patient unavailable',
        nextReviewDate: new Date(Date.now() - 86400000), // yesterday
        version: 1,
      };

      const errors = validateWorkStatusRequirements(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.includes('future'))).toBe(true);
    });

    it('should return multiple errors when ON_HOLD has missing fields', () => {
      const dto: UpdateWorkStatusDto = {
        workStatus: WorkStatus.ON_HOLD,
        version: 1,
      };

      const errors = validateWorkStatusRequirements(dto);
      expect(errors.length).toBeGreaterThanOrEqual(2);
    });

    it('should return no error when ON_HOLD has all required fields', () => {
      const dto: UpdateWorkStatusDto = {
        workStatus: WorkStatus.ON_HOLD,
        reason: 'Patient requested postponement',
        nextReviewDate: new Date(Date.now() + 86400000),
        version: 1,
      };

      const errors = validateWorkStatusRequirements(dto);
      expect(errors).toHaveLength(0);
    });
  });
});
