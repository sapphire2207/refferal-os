import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { BillingService } from './billing.service';
import { PrismaService } from '../../database/prisma.service';
import {
  UserRole,
  AuthTokenPayload,
  BillingStatus,
  WorkStatus,
  CaseOutcome,
  PipelineStage,
} from '@heals/types';

describe('BillingService', () => {
  let service: BillingService;
  let prisma: any;

  const mockReferralReady = {
    id: 'ref-501',
    patientId: 'pat-501',
    pipelineStage: PipelineStage.BILLING,
    workStatus: WorkStatus.PENDING,
    coverageVerified: true,
    insurancePayer: 'Florida Blue',
    insuranceMemberId: 'FLB-123456789',
    site: 'FL-ORLANDO',
    state: 'FL',
    legalEntity: 'HEALS_FL',
    clinicalNotes: [
      { id: 'note-1', signedAt: new Date('2026-11-05') },
    ],
    noteReviews: [
      { id: 'rev-1', decision: 'APPROVE' },
    ],
  };

  const mockClaim = {
    id: 'claim-001',
    referralId: 'ref-501',
    claimNumber: 'CLM-2026-001',
    status: BillingStatus.READY,
    submittedAt: null,
    submittedById: null,
    externalReference: null,
    paidAmount: null,
    paidAt: null,
    denialReason: null,
    rejectionReason: null,
    referral: mockReferralReady,
  };

  const billingUser: AuthTokenPayload = {
    userId: 'biller-1',
    email: 'biller@heals.com',
    roles: [UserRole.BILLING_COORDINATOR],
    scopes: { sites: ['FL-ORLANDO'], states: ['FL'], legalEntities: [] },
    sessionId: 'sess-bill',
    iat: 1,
    exp: 999999,
  };

  const gaBillerUser: AuthTokenPayload = {
    userId: 'ga-biller',
    email: 'ga.biller@heals.com',
    roles: [UserRole.BILLING_COORDINATOR],
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
      claim: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      workflowTransition: {
        create: jest.fn(),
      },
      $transaction: jest.fn((cb) => cb(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<BillingService>(BillingService);
  });

  describe('validateBillingReadiness', () => {
    it('should identify all readiness blockers for incomplete referral', async () => {
      prisma.referral.findUnique.mockResolvedValue({
        id: 'ref-incomplete',
        coverageVerified: false,
        insurancePayer: null,
        insuranceMemberId: null,
        site: 'FL-ORLANDO',
        state: 'FL',
        clinicalNotes: [],
        noteReviews: [],
      });

      const res = await service.validateBillingReadiness('ref-incomplete', billingUser);

      expect(res.isReady).toBe(false);
      expect(res.blockers).toHaveLength(4);
      expect(res.blockers[0]).toContain('Insurance coverage has not been verified');
      expect(res.blockers[1]).toContain('Insurance payer name or policy member ID');
      expect(res.blockers[2]).toContain('No digitally signed clinical note found');
      expect(res.blockers[3]).toContain('Notes QA approval');
    });

    it('should confirm billing readiness when all prerequisites are met', async () => {
      prisma.referral.findUnique.mockResolvedValue(mockReferralReady);

      const res = await service.validateBillingReadiness(mockReferralReady.id, billingUser);

      expect(res.isReady).toBe(true);
      expect(res.blockers).toHaveLength(0);
    });

    it('should throw ForbiddenException if user lacks location scope', async () => {
      prisma.referral.findUnique.mockResolvedValue(mockReferralReady); // FL referral

      await expect(
        service.validateBillingReadiness(mockReferralReady.id, gaBillerUser),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('createClaim', () => {
    it('should throw BadRequestException if referral is not billing-ready', async () => {
      prisma.referral.findUnique.mockResolvedValue({
        ...mockReferralReady,
        coverageVerified: false, // Not ready
      });

      await expect(
        service.createClaim({ referralId: mockReferralReady.id }, billingUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create claim with READY status when referral is billing-ready', async () => {
      prisma.referral.findUnique.mockResolvedValue(mockReferralReady);
      prisma.claim.create.mockResolvedValue(mockClaim);

      const claim = await service.createClaim(
        { referralId: mockReferralReady.id, claimNumber: 'CLM-001' },
        billingUser,
      );

      expect(claim.id).toBe(mockClaim.id);
      expect(prisma.claim.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            referralId: mockReferralReady.id,
            status: BillingStatus.READY,
          }),
        }),
      );
      expect(prisma.referral.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            billingStatus: BillingStatus.READY,
          }),
        }),
      );
    });
  });

  describe('submitClaim', () => {
    it('should submit claim to clearinghouse and update status to SUBMITTED', async () => {
      prisma.claim.findUnique.mockResolvedValue(mockClaim);
      prisma.claim.update.mockResolvedValue({
        ...mockClaim,
        status: BillingStatus.SUBMITTED,
        externalReference: 'EDI-837P-REF1',
      });

      const res = await service.submitClaim(
        mockClaim.id,
        { externalReference: 'EDI-837P-REF1' },
        billingUser,
      );

      expect(res.status).toBe(BillingStatus.SUBMITTED);
      expect(prisma.claim.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockClaim.id },
          data: expect.objectContaining({
            status: BillingStatus.SUBMITTED,
            externalReference: 'EDI-837P-REF1',
            submittedById: billingUser.userId,
          }),
        }),
      );
      expect(prisma.referral.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            billingStatus: BillingStatus.SUBMITTED,
          }),
        }),
      );
    });

    it('should prevent duplicate submission while adjudication is active', async () => {
      prisma.claim.findUnique.mockResolvedValue({
        ...mockClaim,
        status: BillingStatus.SUBMITTED, // Already submitted
        externalReference: 'EDI-837P-ACTIVE',
      });

      await expect(
        service.submitClaim(mockClaim.id, {}, billingUser),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('adjudicateClaim', () => {
    it('should process PAID adjudication: mark claim PAID and close referral lifecycle', async () => {
      prisma.claim.findUnique.mockResolvedValue({
        ...mockClaim,
        status: BillingStatus.SUBMITTED,
      });
      prisma.claim.update.mockResolvedValue({
        ...mockClaim,
        status: BillingStatus.PAID,
        paidAmount: 250.0,
      });
      prisma.referral.update.mockResolvedValue({
        ...mockReferralReady,
        billingStatus: BillingStatus.PAID,
        workStatus: WorkStatus.COMPLETED,
        caseOutcome: CaseOutcome.CLOSED,
      });

      const res = await service.adjudicateClaim(
        mockClaim.id,
        { status: BillingStatus.PAID, paidAmount: 250.0 },
        billingUser,
      );

      expect(res.claim.status).toBe(BillingStatus.PAID);
      expect(prisma.referral.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            billingStatus: BillingStatus.PAID,
            workStatus: WorkStatus.COMPLETED,
            caseOutcome: CaseOutcome.CLOSED,
          }),
        }),
      );
    });

    it('should process DENIED adjudication: update referral to BLOCKED_NEEDS_INFO for follow-up', async () => {
      prisma.claim.findUnique.mockResolvedValue({
        ...mockClaim,
        status: BillingStatus.SUBMITTED,
      });
      prisma.claim.update.mockResolvedValue({
        ...mockClaim,
        status: BillingStatus.DENIED,
        denialReason: 'Prior authorization missing',
      });
      prisma.referral.update.mockResolvedValue({
        ...mockReferralReady,
        billingStatus: BillingStatus.DENIED,
        workStatus: WorkStatus.BLOCKED_NEEDS_INFO,
      });

      const res = await service.adjudicateClaim(
        mockClaim.id,
        { status: BillingStatus.DENIED, denialReason: 'Prior authorization missing' },
        billingUser,
      );

      expect(res.claim.status).toBe(BillingStatus.DENIED);
      expect(prisma.referral.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            billingStatus: BillingStatus.DENIED,
            workStatus: WorkStatus.BLOCKED_NEEDS_INFO,
          }),
        }),
      );
    });

    it('should throw BadRequestException if DENIED adjudication is missing a reason', async () => {
      prisma.claim.findUnique.mockResolvedValue(mockClaim);

      await expect(
        service.adjudicateClaim(
          mockClaim.id,
          { status: BillingStatus.DENIED, denialReason: '' },
          billingUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findAllClaims', () => {
    it('should return paginated claims', async () => {
      prisma.claim.count.mockResolvedValue(1);
      prisma.claim.findMany.mockResolvedValue([mockClaim]);

      const res = await service.findAllClaims({ page: 1, limit: 10 }, billingUser);

      expect(res.total).toBe(1);
      expect(res.data).toHaveLength(1);
    });
  });

  describe('findClaimById', () => {
    it('should return claim by ID', async () => {
      prisma.claim.findUnique.mockResolvedValue(mockClaim);

      const res = await service.findClaimById(mockClaim.id, billingUser);
      expect(res.id).toBe(mockClaim.id);
    });
  });
});
