import { Test, TestingModule } from '@nestjs/testing';
import { ClinicalReviewController } from './clinical-review.controller';
import { ClinicalReviewService } from './clinical-review.service';
import { UserRole, AuthTokenPayload, ClinicalReviewDecision } from '@heals/types';

describe('ClinicalReviewController', () => {
  let controller: ClinicalReviewController;
  let service: any;

  const mockReviewer: AuthTokenPayload = {
    userId: 'reviewer-1',
    email: 'reviewer@heals.com',
    roles: [UserRole.CLINICAL_REVIEWER],
    scopes: { sites: [], states: [], legalEntities: [] },
    sessionId: 'sess-001',
    iat: 1,
    exp: 999999,
  };

  beforeEach(async () => {
    service = {
      createReview: jest.fn().mockResolvedValue({ review: { id: 'rev-1' } }),
      findAll: jest.fn().mockResolvedValue([{ id: 'rev-1' }]),
      findByReferralId: jest.fn().mockResolvedValue([{ id: 'rev-1' }]),
      findById: jest.fn().mockResolvedValue({ id: 'rev-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClinicalReviewController],
      providers: [
        { provide: ClinicalReviewService, useValue: service },
      ],
    }).compile();

    controller = module.get<ClinicalReviewController>(ClinicalReviewController);
  });

  describe('createReview', () => {
    it('should submit clinical review decision', async () => {
      const dto = {
        referralId: 'ref-1',
        decision: ClinicalReviewDecision.ACCEPT,
        notes: 'Approved for visit',
      };

      const res = await controller.createReview(dto, mockReviewer);
      expect(service.createReview).toHaveBeenCalledWith(dto, mockReviewer);
      expect(res.review.id).toBe('rev-1');
    });
  });

  describe('findAll', () => {
    it('should query clinical reviews', async () => {
      const res = await controller.findAll({ referralId: 'ref-1' }, mockReviewer);
      expect(service.findAll).toHaveBeenCalledWith({ referralId: 'ref-1' }, mockReviewer);
      expect(res).toHaveLength(1);
    });
  });

  describe('findByReferralId', () => {
    it('should get review history for a referral', async () => {
      const res = await controller.findByReferralId('ref-1', mockReviewer);
      expect(service.findByReferralId).toHaveBeenCalledWith('ref-1', mockReviewer);
      expect(res).toHaveLength(1);
    });
  });

  describe('findById', () => {
    it('should get single review record', async () => {
      const res = await controller.findById('rev-1', mockReviewer);
      expect(service.findById).toHaveBeenCalledWith('rev-1', mockReviewer);
      expect(res.id).toBe('rev-1');
    });
  });
});
