import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { EncountersService } from './encounters.service';
import { PrismaService } from '../../database/prisma.service';
import {
  UserRole,
  AuthTokenPayload,
  VisitOutcome,
  NoteReviewDecision,
  PipelineStage,
  WorkStatus,
  BillingStatus,
} from '@heals/types';

describe('EncountersService', () => {
  let service: EncountersService;
  let prisma: any;

  const mockReferralInNpVisit = {
    id: 'ref-401',
    patientId: 'pat-401',
    pipelineStage: PipelineStage.NP_VISIT,
    workStatus: WorkStatus.PENDING,
    version: 1,
    site: 'FL-ORLANDO',
    state: 'FL',
    legalEntity: 'HEALS_FL',
  };

  const mockEncounter = {
    id: 'enc-001',
    referralId: 'ref-401',
    appointmentId: 'appt-401',
    outcome: VisitOutcome.COMPLETED,
    dateOfService: new Date('2026-11-05'),
    nursePractitionerId: 'np-001',
    servicesProvided: ['Physical Exam', 'Wound Care'],
    encounterNotes: 'Patient stable',
    completedAt: new Date('2026-11-05T12:00:00Z'),
    referral: mockReferralInNpVisit,
  };

  const mockClinicalNote = {
    id: 'note-001',
    referralId: 'ref-401',
    encounterId: 'enc-001',
    content: 'Initial clinical note draft...',
    noteType: 'PROGRESS_NOTE',
    createdById: 'np-001',
    createdAt: new Date('2026-11-05'),
    submittedAt: null,
    signedAt: null,
    signedById: null,
    referral: mockReferralInNpVisit,
  };

  const npUser: AuthTokenPayload = {
    userId: 'np-001',
    email: 'np.smith@heals.com',
    roles: [UserRole.NURSE_PRACTITIONER],
    scopes: { sites: ['FL-ORLANDO'], states: ['FL'], legalEntities: [] },
    sessionId: 'sess-np',
    iat: 1,
    exp: 999999,
  };

  const qaUser: AuthTokenPayload = {
    userId: 'qa-001',
    email: 'qa.lead@heals.com',
    roles: [UserRole.CLINICAL_COORDINATOR],
    scopes: { sites: ['FL-ORLANDO'], states: ['FL'], legalEntities: [] },
    sessionId: 'sess-qa',
    iat: 1,
    exp: 999999,
  };

  const gaUser: AuthTokenPayload = {
    userId: 'ga-user',
    email: 'ga@heals.com',
    roles: [UserRole.NURSE_PRACTITIONER],
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
      encounter: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      clinicalNote: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      noteReview: {
        create: jest.fn(),
      },
      workflowTransition: {
        create: jest.fn(),
      },
      $transaction: jest.fn((cb) => cb(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EncountersService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<EncountersService>(EncountersService);
  });

  describe('createEncounter', () => {
    it('should throw NotFoundException if referral not found', async () => {
      prisma.referral.findUnique.mockResolvedValue(null);

      await expect(
        service.createEncounter(
          {
            referralId: 'unknown-ref',
            outcome: VisitOutcome.COMPLETED,
            servicesProvided: ['Exam'],
          },
          npUser,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user lacks location scope', async () => {
      prisma.referral.findUnique.mockResolvedValue(mockReferralInNpVisit); // FL referral

      await expect(
        service.createEncounter(
          {
            referralId: mockReferralInNpVisit.id,
            outcome: VisitOutcome.COMPLETED,
            servicesProvided: ['Exam'],
          },
          gaUser, // GA only
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should record COMPLETED encounter and update referral to IN_PROGRESS', async () => {
      prisma.referral.findUnique.mockResolvedValue(mockReferralInNpVisit);
      prisma.encounter.create.mockResolvedValue(mockEncounter);

      const res = await service.createEncounter(
        {
          referralId: mockReferralInNpVisit.id,
          outcome: VisitOutcome.COMPLETED,
          servicesProvided: ['Physical Exam', 'Wound Care'],
        },
        npUser,
      );

      expect(res.id).toBe(mockEncounter.id);
      expect(prisma.encounter.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            outcome: VisitOutcome.COMPLETED,
            nursePractitionerId: npUser.userId,
            completedAt: expect.any(Date),
          }),
        }),
      );
      expect(prisma.referral.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockReferralInNpVisit.id },
          data: expect.objectContaining({
            workStatus: WorkStatus.IN_PROGRESS,
          }),
        }),
      );
    });

    it('should record NO_SHOW encounter and put referral into BLOCKED_NEEDS_INFO', async () => {
      prisma.referral.findUnique.mockResolvedValue(mockReferralInNpVisit);
      prisma.encounter.create.mockResolvedValue({
        ...mockEncounter,
        outcome: VisitOutcome.NO_SHOW,
        completedAt: null,
      });

      await service.createEncounter(
        {
          referralId: mockReferralInNpVisit.id,
          outcome: VisitOutcome.NO_SHOW,
          servicesProvided: [],
          encounterNotes: 'Patient was not at residence during scheduled visit time',
        },
        npUser,
      );

      expect(prisma.referral.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            workStatus: WorkStatus.BLOCKED_NEEDS_INFO,
          }),
        }),
      );
      expect(prisma.workflowTransition.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            toStatus: WorkStatus.BLOCKED_NEEDS_INFO,
          }),
        }),
      );
    });
  });

  describe('createNote', () => {
    it('should create draft clinical note linked to encounter', async () => {
      prisma.encounter.findUnique.mockResolvedValue(mockEncounter);
      prisma.clinicalNote.create.mockResolvedValue(mockClinicalNote);

      const res = await service.createNote(
        {
          referralId: mockReferralInNpVisit.id,
          encounterId: mockEncounter.id,
          noteType: 'PROGRESS_NOTE',
          content: 'Initial clinical note draft...',
        },
        npUser,
      );

      expect(res.id).toBe(mockClinicalNote.id);
      expect(prisma.clinicalNote.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            createdById: npUser.userId,
            content: 'Initial clinical note draft...',
          }),
        }),
      );
    });
  });

  describe('updateDraftNote', () => {
    it('should update unsigned draft note', async () => {
      prisma.clinicalNote.findUnique.mockResolvedValue(mockClinicalNote); // signedAt is null
      prisma.clinicalNote.update.mockResolvedValue({
        ...mockClinicalNote,
        content: 'Updated draft content',
      });

      const res = await service.updateDraftNote(
        mockClinicalNote.id,
        { content: 'Updated draft content' },
        npUser,
      );

      expect(res.content).toBe('Updated draft content');
    });

    it('should throw BadRequestException if attempting to edit a digitally signed note', async () => {
      prisma.clinicalNote.findUnique.mockResolvedValue({
        ...mockClinicalNote,
        signedAt: new Date('2026-11-05T14:00:00Z'),
        signedById: npUser.userId,
      });

      await expect(
        service.updateDraftNote(
          mockClinicalNote.id,
          { content: 'Attempted edit after signing' },
          npUser,
        ),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.clinicalNote.update).not.toHaveBeenCalled();
    });
  });

  describe('signAndSubmitNote', () => {
    it('should digitally sign note and advance referral to NOTES_QA stage', async () => {
      prisma.clinicalNote.findUnique.mockResolvedValue(mockClinicalNote);
      prisma.clinicalNote.update.mockResolvedValue({
        ...mockClinicalNote,
        signedAt: new Date(),
        signedById: npUser.userId,
        submittedAt: new Date(),
      });
      prisma.referral.update.mockResolvedValue({
        ...mockReferralInNpVisit,
        pipelineStage: PipelineStage.NOTES_QA,
        workStatus: WorkStatus.PENDING,
        version: 2,
      });

      const res = await service.signAndSubmitNote(mockClinicalNote.id, npUser);

      expect(res.note.signedAt).toBeDefined();
      expect(prisma.referral.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockClinicalNote.referralId },
          data: expect.objectContaining({
            pipelineStage: PipelineStage.NOTES_QA,
            workStatus: WorkStatus.PENDING,
          }),
        }),
      );
      expect(prisma.workflowTransition.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            toStage: PipelineStage.NOTES_QA,
          }),
        }),
      );
    });
  });

  describe('reviewNote', () => {
    const signedNote = {
      ...mockClinicalNote,
      signedAt: new Date('2026-11-05T14:00:00Z'),
      signedById: npUser.userId,
    };

    it('should throw BadRequestException if note is unsigned', async () => {
      prisma.clinicalNote.findUnique.mockResolvedValue(mockClinicalNote); // signedAt null

      await expect(
        service.reviewNote(
          mockClinicalNote.id,
          { decision: NoteReviewDecision.APPROVE },
          qaUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should APPROVE note: advance referral to BILLING with READY status', async () => {
      prisma.clinicalNote.findUnique.mockResolvedValue(signedNote);
      prisma.noteReview.create.mockResolvedValue({
        id: 'rev-001',
        decision: NoteReviewDecision.APPROVE,
      });
      prisma.referral.update.mockResolvedValue({
        ...mockReferralInNpVisit,
        pipelineStage: PipelineStage.BILLING,
        workStatus: WorkStatus.PENDING,
        billingStatus: BillingStatus.READY,
        version: 3,
      });

      const res = await service.reviewNote(
        signedNote.id,
        { decision: NoteReviewDecision.APPROVE, reason: 'Compliant clinical note' },
        qaUser,
      );

      expect(res.review.id).toBe('rev-001');
      expect(prisma.referral.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            pipelineStage: PipelineStage.BILLING,
            workStatus: WorkStatus.PENDING,
            billingStatus: BillingStatus.READY,
          }),
        }),
      );
    });

    it('should RETURN_FOR_CORRECTION: return referral to NP_VISIT and reassign to NP', async () => {
      prisma.clinicalNote.findUnique.mockResolvedValue(signedNote);
      prisma.noteReview.create.mockResolvedValue({
        id: 'rev-002',
        decision: NoteReviewDecision.RETURN_FOR_CORRECTION,
      });
      prisma.referral.update.mockResolvedValue({
        ...mockReferralInNpVisit,
        pipelineStage: PipelineStage.NP_VISIT,
        workStatus: WorkStatus.BLOCKED_NEEDS_INFO,
        assignedTo: signedNote.createdById,
        version: 3,
      });

      await service.reviewNote(
        signedNote.id,
        {
          decision: NoteReviewDecision.RETURN_FOR_CORRECTION,
          correctionRequired: 'Please detail specific wound measurement dimensions',
        },
        qaUser,
      );

      expect(prisma.referral.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            pipelineStage: PipelineStage.NP_VISIT,
            workStatus: WorkStatus.BLOCKED_NEEDS_INFO,
            assignedTo: signedNote.createdById,
            assignedRole: UserRole.NURSE_PRACTITIONER,
          }),
        }),
      );
    });
  });

  describe('findNoteById', () => {
    it('should return note details by ID', async () => {
      prisma.clinicalNote.findUnique.mockResolvedValue(mockClinicalNote);

      const res = await service.findNoteById(mockClinicalNote.id, npUser);
      expect(res.id).toBe(mockClinicalNote.id);
    });
  });
});
