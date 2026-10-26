import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { ClinicalReviewService } from './clinical-review.service';
import { PrismaService } from '../../database/prisma.service';
import {
  UserRole,
  AuthTokenPayload,
  ClinicalReviewDecision,
  PipelineStage,
  WorkStatus,
  CaseOutcome,
} from '@heals/types';

describe('ClinicalReviewService', () => {
  let service: ClinicalReviewService;
  let prisma: any;

  const mockReferralInReview = {
    id: 'ref-201',
    patientId: 'pat-201',
    pipelineStage: PipelineStage.CLINICAL_REVIEW,
    workStatus: WorkStatus.IN_PROGRESS,
    caseOutcome: CaseOutcome.ACTIVE,
    version: 2,
    site: 'FL-ORLANDO',
    state: 'FL',
    legalEntity: 'HEALS_FL',
  };

  const mockReviewRecord = {
    id: 'rev-001',
    referralId: 'ref-201',
    reviewerId: 'reviewer-1',
    decision: ClinicalReviewDecision.ACCEPT,
    reason: null,
    notes: 'Clinically appropriate',
    reviewedAt: new Date('2026-01-01'),
    referral: mockReferralInReview,
  };

  const reviewerUser: AuthTokenPayload = {
    userId: 'reviewer-1',
    email: 'reviewer@heals.com',
    roles: [UserRole.CLINICAL_REVIEWER],
    scopes: { sites: ['FL-ORLANDO'], states: ['FL'], legalEntities: [] },
    sessionId: 'sess-rev',
    iat: 1,
    exp: 999999,
  };

  const gaReviewerUser: AuthTokenPayload = {
    userId: 'reviewer-ga',
    email: 'ga.rev@heals.com',
    roles: [UserRole.CLINICAL_REVIEWER],
    scopes: { sites: ['GA-ATLANTA'], states: ['GA'], legalEntities: [] },
    sessionId: 'sess-ga',
    iat: 1,
    exp: 999999,
  };

  beforeEach(async () => {
    prisma = {
      referral: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      clinicalReview: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
      },
      workflowTransition: {
        create: jest.fn(),
      },
      $transaction: jest.fn((cb) => cb(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClinicalReviewService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<ClinicalReviewService>(ClinicalReviewService);
  });

  describe('createReview', () => {
    it('should throw NotFoundException if referral does not exist', async () => {
      prisma.referral.findUnique.mockResolvedValue(null);

      await expect(
        service.createReview(
          { referralId: 'unknown-ref', decision: ClinicalReviewDecision.ACCEPT },
          reviewerUser,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user lacks location scope for referral', async () => {
      prisma.referral.findUnique.mockResolvedValue(mockReferralInReview); // FL referral

      await expect(
        service.createReview(
          { referralId: mockReferralInReview.id, decision: ClinicalReviewDecision.ACCEPT },
          gaReviewerUser, // Only GA authorized
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException if referral is not in CLINICAL_REVIEW stage', async () => {
      prisma.referral.findUnique.mockResolvedValue({
        ...mockReferralInReview,
        pipelineStage: PipelineStage.INTAKE, // Still in INTAKE
      });

      await expect(
        service.createReview(
          { referralId: mockReferralInReview.id, decision: ClinicalReviewDecision.ACCEPT },
          reviewerUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if RETURN decision is missing a mandatory reason', async () => {
      prisma.referral.findUnique.mockResolvedValue(mockReferralInReview);

      await expect(
        service.createReview(
          { referralId: mockReferralInReview.id, decision: ClinicalReviewDecision.RETURN, reason: '' },
          reviewerUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if REJECT decision is missing a mandatory reason', async () => {
      prisma.referral.findUnique.mockResolvedValue(mockReferralInReview);

      await expect(
        service.createReview(
          { referralId: mockReferralInReview.id, decision: ClinicalReviewDecision.REJECT, reason: '' },
          reviewerUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should process ACCEPT decision: advance to SCHEDULING and record workflow transition', async () => {
      prisma.referral.findUnique.mockResolvedValue(mockReferralInReview);
      prisma.clinicalReview.create.mockResolvedValue(mockReviewRecord);
      prisma.referral.update.mockResolvedValue({
        ...mockReferralInReview,
        pipelineStage: PipelineStage.SCHEDULING,
        workStatus: WorkStatus.PENDING,
        version: 3,
      });

      const res = await service.createReview(
        {
          referralId: mockReferralInReview.id,
          decision: ClinicalReviewDecision.ACCEPT,
          notes: 'Clinically appropriate for mobile NP visit',
        },
        reviewerUser,
      );

      expect(res.review.id).toBe(mockReviewRecord.id);
      expect(prisma.referral.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockReferralInReview.id },
          data: expect.objectContaining({
            pipelineStage: PipelineStage.SCHEDULING,
            workStatus: WorkStatus.PENDING,
          }),
        }),
      );
      expect(prisma.workflowTransition.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            referralId: mockReferralInReview.id,
            fromStage: PipelineStage.CLINICAL_REVIEW,
            toStage: PipelineStage.SCHEDULING,
            transitionedBy: reviewerUser.userId,
          }),
        }),
      );
    });

    it('should process RETURN decision: return to INTAKE with BLOCKED_NEEDS_INFO', async () => {
      prisma.referral.findUnique.mockResolvedValue(mockReferralInReview);
      prisma.clinicalReview.create.mockResolvedValue({
        ...mockReviewRecord,
        decision: ClinicalReviewDecision.RETURN,
        reason: 'Missing medication list',
      });
      prisma.referral.update.mockResolvedValue({
        ...mockReferralInReview,
        pipelineStage: PipelineStage.INTAKE,
        workStatus: WorkStatus.BLOCKED_NEEDS_INFO,
        version: 3,
      });

      const res = await service.createReview(
        {
          referralId: mockReferralInReview.id,
          decision: ClinicalReviewDecision.RETURN,
          reason: 'Missing medication list',
        },
        reviewerUser,
      );

      expect(prisma.referral.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockReferralInReview.id },
          data: expect.objectContaining({
            pipelineStage: PipelineStage.INTAKE,
            workStatus: WorkStatus.BLOCKED_NEEDS_INFO,
          }),
        }),
      );
      expect(prisma.workflowTransition.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            toStage: PipelineStage.INTAKE,
            toStatus: WorkStatus.BLOCKED_NEEDS_INFO,
            reason: 'Missing medication list',
          }),
        }),
      );
    });

    it('should process REJECT decision: set CaseOutcome to REJECTED and mark COMPLETED', async () => {
      prisma.referral.findUnique.mockResolvedValue(mockReferralInReview);
      prisma.clinicalReview.create.mockResolvedValue({
        ...mockReviewRecord,
        decision: ClinicalReviewDecision.REJECT,
        reason: 'Condition requires acute hospital admission',
      });
      prisma.referral.update.mockResolvedValue({
        ...mockReferralInReview,
        caseOutcome: CaseOutcome.REJECTED,
        workStatus: WorkStatus.COMPLETED,
        version: 3,
      });

      await service.createReview(
        {
          referralId: mockReferralInReview.id,
          decision: ClinicalReviewDecision.REJECT,
          reason: 'Condition requires acute hospital admission',
        },
        reviewerUser,
      );

      expect(prisma.referral.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            caseOutcome: CaseOutcome.REJECTED,
            workStatus: WorkStatus.COMPLETED,
          }),
        }),
      );
    });
  });

  describe('findByReferralId', () => {
    it('should return chronological review history for a referral', async () => {
      prisma.referral.findUnique.mockResolvedValue(mockReferralInReview);
      prisma.clinicalReview.findMany.mockResolvedValue([mockReviewRecord]);

      const res = await service.findByReferralId(mockReferralInReview.id, reviewerUser);

      expect(res).toHaveLength(1);
      expect(res[0].id).toBe(mockReviewRecord.id);
    });
  });

  describe('findById', () => {
    it('should return review by ID', async () => {
      prisma.clinicalReview.findUnique.mockResolvedValue(mockReviewRecord);

      const res = await service.findById(mockReviewRecord.id, reviewerUser);
      expect(res.id).toBe(mockReviewRecord.id);
    });
  });
});
