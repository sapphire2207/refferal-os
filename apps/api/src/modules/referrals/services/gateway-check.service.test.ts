import { Test, TestingModule } from '@nestjs/testing';
import { GatewayCheckService } from './gateway-check.service';
import { PrismaService } from '../../../database/prisma.service';
import { WorkStatus, CaseOutcome, BillingStatus, Priority } from '@prisma/client';
import { PipelineStage } from '@heals/types';
import { Referral } from '@prisma/client';

describe('GatewayCheckService', () => {
  let service: GatewayCheckService;
  let prismaService: jest.Mocked<PrismaService>;

  const mockPrismaService = {
    clinicalReview: {
      findFirst: jest.fn(),
    },
    encounter: {
      findFirst: jest.fn(),
    },
    clinicalNote: {
      findFirst: jest.fn(),
    },
    noteReview: {
      findFirst: jest.fn(),
    },
    appointment: {
      findFirst: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GatewayCheckService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<GatewayCheckService>(GatewayCheckService);
    prismaService = module.get(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('checkIntakeComplete', () => {
    const createMockReferral = (overrides?: Partial<Referral>): Referral => ({
      id: 'referral-123',
      patientId: 'patient-456',
      pipelineStage: PipelineStage.INTAKE,
      workStatus: WorkStatus.IN_PROGRESS,
      caseOutcome: CaseOutcome.ACTIVE,
      billingStatus: BillingStatus.NOT_READY,
      priority: Priority.ROUTINE,
      referralSource: 'Primary Care',
      referringProvider: 'Dr. Smith',
      referringProviderNpi: '1234567890',
      referringFacility: 'City Hospital',
      insurancePayer: 'Blue Cross',
      insuranceMemberId: 'MEM123456',
      insuranceGroupNumber: 'GRP789',
      coverageVerified: true,
      coverageVerificationDate: new Date('2024-01-15'),
      coverageNotes: 'Verified with payer',
      site: 'NYC-01',
      state: 'NY',
      legalEntity: 'Heals LLC',
      assignedTo: 'user-789',
      assignedRole: null,
      version: 1,
      createdAt: new Date('2024-01-10'),
      updatedAt: new Date('2024-01-15'),
      ...overrides,
    });

    it('should pass validation when all required fields are present and coverage is verified', async () => {
      const referral = createMockReferral();

      const result = await service.checkIntakeComplete(referral);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail when patientId is missing', async () => {
      const referral = createMockReferral({ patientId: null as any });

      const result = await service.checkIntakeComplete(referral);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        type: 'gate',
        field: 'patientId',
        message: 'Patient is required before transitioning to clinical review',
      });
    });

    it('should fail when referralSource is missing', async () => {
      const referral = createMockReferral({ referralSource: null });

      const result = await service.checkIntakeComplete(referral);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        type: 'gate',
        field: 'referralSource',
        message: 'Referral Source is required before transitioning to clinical review',
      });
    });

    it('should fail when insurancePayer is missing', async () => {
      const referral = createMockReferral({ insurancePayer: null });

      const result = await service.checkIntakeComplete(referral);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        type: 'gate',
        field: 'insurancePayer',
        message: 'Insurance Payer is required before transitioning to clinical review',
      });
    });

    it('should fail when site is missing', async () => {
      const referral = createMockReferral({ site: null });

      const result = await service.checkIntakeComplete(referral);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        type: 'gate',
        field: 'site',
        message: 'Site is required before transitioning to clinical review',
      });
    });

    it('should fail when state is missing', async () => {
      const referral = createMockReferral({ state: null });

      const result = await service.checkIntakeComplete(referral);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        type: 'gate',
        field: 'state',
        message: 'State is required before transitioning to clinical review',
      });
    });

    it('should fail when coverageVerified is false', async () => {
      const referral = createMockReferral({ coverageVerified: false });

      const result = await service.checkIntakeComplete(referral);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        type: 'gate',
        field: 'coverageVerified',
        message: 'Coverage verification is required before clinical review',
      });
    });

    it('should return all errors when multiple fields are missing', async () => {
      const referral = createMockReferral({
        referralSource: null,
        insurancePayer: null,
        site: null,
        coverageVerified: false,
      });

      const result = await service.checkIntakeComplete(referral);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(4);
      
      const errorFields = result.errors.map(e => e.field);
      expect(errorFields).toContain('referralSource');
      expect(errorFields).toContain('insurancePayer');
      expect(errorFields).toContain('site');
      expect(errorFields).toContain('coverageVerified');
    });

    it('should return all 6 errors when all required fields are missing', async () => {
      const referral = createMockReferral({
        patientId: null as any,
        referralSource: null,
        insurancePayer: null,
        site: null,
        state: null,
        coverageVerified: false,
      });

      const result = await service.checkIntakeComplete(referral);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(6);
      
      const errorFields = result.errors.map(e => e.field);
      expect(errorFields).toContain('patientId');
      expect(errorFields).toContain('referralSource');
      expect(errorFields).toContain('insurancePayer');
      expect(errorFields).toContain('site');
      expect(errorFields).toContain('state');
      expect(errorFields).toContain('coverageVerified');
    });

    it('should pass when optional fields are missing but required fields are present', async () => {
      const referral = createMockReferral({
        referringProvider: null,
        referringProviderNpi: null,
        referringFacility: null,
        insuranceMemberId: null,
        insuranceGroupNumber: null,
        coverageVerificationDate: null,
        coverageNotes: null,
      });

      const result = await service.checkIntakeComplete(referral);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate all error objects have correct structure', async () => {
      const referral = createMockReferral({
        referralSource: null,
        coverageVerified: false,
      });

      const result = await service.checkIntakeComplete(referral);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
      
      result.errors.forEach(error => {
        expect(error).toHaveProperty('type');
        expect(error).toHaveProperty('field');
        expect(error).toHaveProperty('message');
        expect(error.type).toBe('gate');
        expect(typeof error.field).toBe('string');
        expect(typeof error.message).toBe('string');
      });
    });
  });

  describe('checkClinicalAccept', () => {
    const mockReferral: Partial<Referral> = {
      id: 'ref-123',
      pipelineStage: PipelineStage.CLINICAL_REVIEW,
      version: 1,
    };

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should return valid when ClinicalReview with ACCEPT decision exists', async () => {
      const mockClinicalReview = {
        id: 'review-1',
        referralId: 'ref-123',
        decision: 'ACCEPT',
        reviewerId: 'reviewer-1',
        reviewedAt: new Date(),
        reason: null,
        notes: null,
      };

      (mockPrismaService.clinicalReview.findFirst as jest.Mock).mockResolvedValue(
        mockClinicalReview,
      );

      const result = await service.checkClinicalAccept(mockReferral as Referral);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(mockPrismaService.clinicalReview.findFirst).toHaveBeenCalledWith({
        where: {
          referralId: 'ref-123',
          decision: 'ACCEPT',
        },
        orderBy: {
          reviewedAt: 'desc',
        },
      });
    });

    it('should return invalid when no ClinicalReview with ACCEPT decision exists', async () => {
      (mockPrismaService.clinicalReview.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await service.checkClinicalAccept(mockReferral as Referral);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        type: 'gate',
        message:
          'Clinical review with ACCEPT decision is required before transitioning to SCHEDULING',
        details: {
          gate: 'ClinicalAccept',
          referralId: 'ref-123',
        },
      });
    });

    it('should query for most recent review when multiple reviews exist', async () => {
      const mockClinicalReview = {
        id: 'review-2',
        referralId: 'ref-123',
        decision: 'ACCEPT',
        reviewerId: 'reviewer-2',
        reviewedAt: new Date('2024-01-15'),
        reason: null,
        notes: null,
      };

      (mockPrismaService.clinicalReview.findFirst as jest.Mock).mockResolvedValue(
        mockClinicalReview,
      );

      const result = await service.checkClinicalAccept(mockReferral as Referral);

      expect(result.valid).toBe(true);
      expect(mockPrismaService.clinicalReview.findFirst).toHaveBeenCalledWith({
        where: {
          referralId: 'ref-123',
          decision: 'ACCEPT',
        },
        orderBy: {
          reviewedAt: 'desc',
        },
      });
    });

    it('should handle database errors gracefully', async () => {
      (mockPrismaService.clinicalReview.findFirst as jest.Mock).mockRejectedValue(
        new Error('Database connection failed'),
      );

      await expect(
        service.checkClinicalAccept(mockReferral as Referral),
      ).rejects.toThrow('Database connection failed');
    });

    it('should validate with different referral id', async () => {
      const differentReferral: Partial<Referral> = {
        id: 'ref-456',
        pipelineStage: PipelineStage.CLINICAL_REVIEW,
        version: 1,
      };

      const mockClinicalReview = {
        id: 'review-3',
        referralId: 'ref-456',
        decision: 'ACCEPT',
        reviewerId: 'reviewer-1',
        reviewedAt: new Date(),
        reason: null,
        notes: null,
      };

      (mockPrismaService.clinicalReview.findFirst as jest.Mock).mockResolvedValue(
        mockClinicalReview,
      );

      const result = await service.checkClinicalAccept(
        differentReferral as Referral,
      );

      expect(result.valid).toBe(true);
      expect(mockPrismaService.clinicalReview.findFirst).toHaveBeenCalledWith({
        where: {
          referralId: 'ref-456',
          decision: 'ACCEPT',
        },
        orderBy: {
          reviewedAt: 'desc',
        },
      });
    });

    it('should return invalid when only RETURN or REJECT decisions exist', async () => {
      // Simulate scenario where there are reviews but none with ACCEPT
      (mockPrismaService.clinicalReview.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await service.checkClinicalAccept(mockReferral as Referral);

      expect(result.valid).toBe(false);
      expect(result.errors[0].type).toBe('gate');
      expect(result.errors[0].message).toContain(
        'Clinical review with ACCEPT decision is required',
      );
    });

    it('should include referralId in error details for debugging', async () => {
      (mockPrismaService.clinicalReview.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await service.checkClinicalAccept(mockReferral as Referral);

      expect(result.valid).toBe(false);
      expect(result.errors[0].details).toEqual({
        gate: 'ClinicalAccept',
        referralId: 'ref-123',
      });
    });

    it('should only query for ACCEPT decisions, not RETURN or REJECT', async () => {
      (mockPrismaService.clinicalReview.findFirst as jest.Mock).mockResolvedValue(null);

      await service.checkClinicalAccept(mockReferral as Referral);

      expect(mockPrismaService.clinicalReview.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            decision: 'ACCEPT',
          }),
        }),
      );
    });
  });

  describe('checkVisitComplete', () => {
    const createMockReferral = (overrides?: Partial<Referral>): Referral => ({
      id: 'ref-123',
      patientId: 'patient-456',
      pipelineStage: PipelineStage.NP_VISIT,
      workStatus: WorkStatus.IN_PROGRESS,
      caseOutcome: CaseOutcome.ACTIVE,
      billingStatus: BillingStatus.NOT_READY,
      priority: Priority.ROUTINE,
      referralSource: 'Primary Care',
      referringProvider: 'Dr. Smith',
      referringProviderNpi: '1234567890',
      referringFacility: 'City Hospital',
      insurancePayer: 'Blue Cross',
      insuranceMemberId: 'MEM123456',
      insuranceGroupNumber: 'GRP789',
      coverageVerified: true,
      coverageVerificationDate: new Date('2024-01-15'),
      coverageNotes: 'Verified with payer',
      site: 'NYC-01',
      state: 'NY',
      legalEntity: 'Heals LLC',
      assignedTo: 'np-123',
      assignedRole: null,
      version: 1,
      createdAt: new Date('2024-01-10'),
      updatedAt: new Date('2024-01-15'),
      ...overrides,
    });

    const mockEncounter = {
      id: 'enc-123',
      referralId: 'ref-123',
      outcome: 'COMPLETED',
      dateOfService: new Date('2024-01-15'),
      servicesProvided: ['Consultation', 'Examination'],
      nursePractitionerId: 'np-123',
      createdAt: new Date(),
      completedAt: new Date(),
      encounterNotes: 'Patient seen',
      appointmentId: 'apt-123',
    };

    const mockClinicalNote = {
      id: 'note-123',
      referralId: 'ref-123',
      encounterId: 'enc-123',
      content: 'Clinical note content',
      noteType: 'SOAP',
      createdById: 'np-123',
      createdAt: new Date(),
      submittedAt: new Date(),
      signedAt: null,
      signedById: null,
    };

    beforeEach(() => {
      mockPrismaService.encounter = { findFirst: jest.fn() } as any;
      mockPrismaService.clinicalNote = { findFirst: jest.fn() } as any;
    });

    it('should return valid when all requirements are met', async () => {
      (mockPrismaService.encounter.findFirst as jest.Mock).mockResolvedValue(mockEncounter);
      (mockPrismaService.clinicalNote.findFirst as jest.Mock).mockResolvedValue(mockClinicalNote);
      const result = await service.checkVisitComplete(createMockReferral());
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return error when no completed encounter exists', async () => {
      (mockPrismaService.encounter.findFirst as jest.Mock).mockResolvedValue(null);
      const result = await service.checkVisitComplete(createMockReferral());
      expect(result.valid).toBe(false);
      expect(result.errors[0].field).toBe('encounter');
    });

    it('should return error when dateOfService is missing', async () => {
      (mockPrismaService.encounter.findFirst as jest.Mock).mockResolvedValue({ ...mockEncounter, dateOfService: null });
      (mockPrismaService.clinicalNote.findFirst as jest.Mock).mockResolvedValue(mockClinicalNote);
      const result = await service.checkVisitComplete(createMockReferral());
      expect(result.valid).toBe(false);
      expect(result.errors[0].field).toBe('dateOfService');
    });

    it('should return error when servicesProvided is empty', async () => {
      (mockPrismaService.encounter.findFirst as jest.Mock).mockResolvedValue({ ...mockEncounter, servicesProvided: [] });
      (mockPrismaService.clinicalNote.findFirst as jest.Mock).mockResolvedValue(mockClinicalNote);
      const result = await service.checkVisitComplete(createMockReferral());
      expect(result.valid).toBe(false);
      expect(result.errors[0].field).toBe('servicesProvided');
    });

    it('should return error when clinical note is not submitted', async () => {
      (mockPrismaService.encounter.findFirst as jest.Mock).mockResolvedValue(mockEncounter);
      (mockPrismaService.clinicalNote.findFirst as jest.Mock).mockResolvedValue(null);
      const result = await service.checkVisitComplete(createMockReferral());
      expect(result.valid).toBe(false);
      expect(result.errors[0].field).toBe('clinicalNote');
    });

    it('should return multiple errors when multiple requirements fail', async () => {
      (mockPrismaService.encounter.findFirst as jest.Mock).mockResolvedValue({ ...mockEncounter, dateOfService: null, servicesProvided: [] });
      (mockPrismaService.clinicalNote.findFirst as jest.Mock).mockResolvedValue(null);
      const result = await service.checkVisitComplete(createMockReferral());
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(3);
    });
  });

  describe('checkNoteApproved', () => {
    const createMockReferral = (overrides?: Partial<Referral>): Referral => ({
      id: 'ref-123',
      patientId: 'patient-456',
      pipelineStage: PipelineStage.NOTES_QA,
      workStatus: WorkStatus.IN_PROGRESS,
      caseOutcome: CaseOutcome.ACTIVE,
      billingStatus: BillingStatus.READY,
      priority: Priority.ROUTINE,
      referralSource: 'Primary Care',
      referringProvider: 'Dr. Smith',
      referringProviderNpi: '1234567890',
      referringFacility: 'City Hospital',
      insurancePayer: 'Blue Cross',
      insuranceMemberId: 'MEM123456',
      insuranceGroupNumber: 'GRP789',
      coverageVerified: true,
      coverageVerificationDate: new Date('2024-01-15'),
      coverageNotes: 'Verified with payer',
      site: 'NYC-01',
      state: 'NY',
      legalEntity: 'Heals LLC',
      assignedTo: 'qa-123',
      assignedRole: null,
      version: 1,
      createdAt: new Date('2024-01-10'),
      updatedAt: new Date('2024-01-15'),
      ...overrides,
    });

    const mockNote = {
      id: 'note-123',
      referralId: 'ref-123',
      encounterId: 'enc-123',
      content: 'SOAP note',
      noteType: 'SOAP',
      createdById: 'np-123',
      createdAt: new Date(),
      submittedAt: new Date(),
    };

    const mockNoteReview = {
      id: 'review-123',
      clinicalNoteId: 'note-123',
      referralId: 'ref-123',
      reviewerId: 'qa-123',
      decision: 'APPROVE',
      reviewedAt: new Date(),
    };

    it('should return valid when billingStatus is READY, note is submitted, and note is approved', async () => {
      (mockPrismaService.clinicalNote.findFirst as jest.Mock).mockResolvedValue(mockNote);
      (mockPrismaService.noteReview.findFirst as jest.Mock).mockResolvedValue(mockNoteReview);

      const result = await service.checkNoteApproved(createMockReferral());
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return error when billingStatus is not READY', async () => {
      (mockPrismaService.clinicalNote.findFirst as jest.Mock).mockResolvedValue(mockNote);
      (mockPrismaService.noteReview.findFirst as jest.Mock).mockResolvedValue(mockNoteReview);

      const result = await service.checkNoteApproved(
        createMockReferral({ billingStatus: BillingStatus.NOT_READY }),
      );
      expect(result.valid).toBe(false);
      expect(result.errors[0].field).toBe('billingStatus');
    });

    it('should return error when no submitted clinical note exists', async () => {
      (mockPrismaService.clinicalNote.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await service.checkNoteApproved(createMockReferral());
      expect(result.valid).toBe(false);
      expect(result.errors[0].field).toBe('clinicalNote');
    });

    it('should return error when clinical note is not approved', async () => {
      (mockPrismaService.clinicalNote.findFirst as jest.Mock).mockResolvedValue(mockNote);
      (mockPrismaService.noteReview.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await service.checkNoteApproved(createMockReferral());
      expect(result.valid).toBe(false);
      expect(result.errors[0].field).toBe('noteReview');
    });
  });

  describe('checkGatesForTransition', () => {
    const createMockReferral = (overrides?: Partial<Referral>): Referral => ({
      id: 'ref-123',
      patientId: 'patient-456',
      pipelineStage: PipelineStage.INTAKE,
      workStatus: WorkStatus.IN_PROGRESS,
      caseOutcome: CaseOutcome.ACTIVE,
      billingStatus: BillingStatus.NOT_READY,
      priority: Priority.ROUTINE,
      referralSource: 'Primary Care',
      referringProvider: 'Dr. Smith',
      referringProviderNpi: '1234567890',
      referringFacility: 'City Hospital',
      insurancePayer: 'Blue Cross',
      insuranceMemberId: 'MEM123456',
      insuranceGroupNumber: 'GRP789',
      coverageVerified: true,
      coverageVerificationDate: new Date('2024-01-15'),
      coverageNotes: 'Verified with payer',
      site: 'NYC-01',
      state: 'NY',
      legalEntity: 'Heals LLC',
      assignedTo: 'user-123',
      assignedRole: null,
      version: 1,
      createdAt: new Date('2024-01-10'),
      updatedAt: new Date('2024-01-15'),
      ...overrides,
    });

    it('should require a reason for backward transition', async () => {
      const referral = createMockReferral({
        pipelineStage: PipelineStage.CLINICAL_REVIEW,
      });

      const result = await service.checkGatesForTransition({
        referral,
        targetStage: PipelineStage.INTAKE,
        user: {} as any,
        reason: '',
      });

      expect(result.valid).toBe(false);
      expect(result.errors[0].field).toBe('reason');
    });

    it('should pass backward transition when reason is provided', async () => {
      const referral = createMockReferral({
        pipelineStage: PipelineStage.CLINICAL_REVIEW,
      });

      const result = await service.checkGatesForTransition({
        referral,
        targetStage: PipelineStage.INTAKE,
        user: {} as any,
        reason: 'Missing primary doctor contact info',
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate forward transition INTAKE -> CLINICAL_REVIEW', async () => {
      const referral = createMockReferral();

      const result = await service.checkGatesForTransition({
        referral,
        targetStage: PipelineStage.CLINICAL_REVIEW,
        user: {} as any,
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});
