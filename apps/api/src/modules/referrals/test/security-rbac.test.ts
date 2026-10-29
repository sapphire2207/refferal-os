import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ValidationService } from '../services/validation.service';
import { ReferralsService } from '../services/referrals.service';
import { EventService } from '../services/event.service';
import { DocumentsService } from '../../documents/documents.service';
import { PatientsService } from '../../patients/patients.service';
import { EncountersService } from '../../encounters/encounters.service';
import { CommentsService } from '../../comments/comments.service';
import { PrismaService } from '../../../database/prisma.service';
import { RedisService } from '../../../redis/redis.service';
import { AuditService } from '../../audit/audit.service';
import {
  UserRole,
  AuthTokenPayload,
  PipelineStage,
  WorkStatus,
  DocumentType,
  NoteReviewDecision,
} from '@heals/types';

describe('Security & RBAC Hardening Regression Suite', () => {
  let validationService: ValidationService;
  let referralsService: ReferralsService;
  let documentsService: DocumentsService;
  let patientsService: PatientsService;
  let encountersService: EncountersService;
  let commentsService: CommentsService;
  let auditService: AuditService;

  // Mock users
  const unscopedUser: AuthTokenPayload = {
    userId: 'usr-unscoped-1',
    email: 'unscoped@healsonwheels.com',
    roles: [UserRole.INTAKE_SPECIALIST],
    scopes: { sites: [], states: [], legalEntities: [] }, // EMPTY SCOPES
    sessionId: 'sess-1',
    iat: 1,
    exp: 999999,
  };

  const officeManagerUser: AuthTokenPayload = {
    userId: 'usr-om-1',
    email: 'om@healsonwheels.com',
    roles: [UserRole.OFFICE_MANAGER],
    scopes: { sites: ['site-a'], states: ['FL'], legalEntities: ['heals-fl'] },
    sessionId: 'sess-2',
    iat: 1,
    exp: 999999,
  };

  const billingUser: AuthTokenPayload = {
    userId: 'usr-bill-1',
    email: 'billing@healsonwheels.com',
    roles: [UserRole.BILLING_COORDINATOR],
    scopes: { sites: ['site-a'], states: ['FL'], legalEntities: ['heals-fl'] },
    sessionId: 'sess-3',
    iat: 1,
    exp: 999999,
  };

  const clinicalReviewerUser: AuthTokenPayload = {
    userId: 'usr-cr-1',
    email: 'reviewer@healsonwheels.com',
    roles: [UserRole.CLINICAL_REVIEWER],
    scopes: { sites: ['site-a'], states: ['FL'], legalEntities: ['heals-fl'] },
    sessionId: 'sess-4',
    iat: 1,
    exp: 999999,
  };

  const adminUser: AuthTokenPayload = {
    userId: 'usr-admin-1',
    email: 'admin@healsonwheels.com',
    roles: [UserRole.ADMIN],
    scopes: { sites: [], states: [], legalEntities: [] },
    sessionId: 'sess-5',
    iat: 1,
    exp: 999999,
  };

  const mockPrisma: any = {
    referral: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    patient: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    document: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    clinicalNote: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    encounter: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
    },
    comment: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn((cb) => cb(mockPrisma)),
  };

  const mockRedis: any = {
    del: jest.fn().mockResolvedValue(undefined),
    delPattern: jest.fn().mockResolvedValue(undefined),
    getJson: jest.fn().mockResolvedValue(null),
    setJson: jest.fn().mockResolvedValue(undefined),
  };

  const mockAudit: any = {
    recordEvent: jest.fn().mockResolvedValue({ id: 'audit-1' }),
    logPhiAccess: jest.fn().mockResolvedValue({ id: 'audit-phi-1' }),
  };

  const mockEvent: any = {
    enqueueEvent: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ValidationService,
        ReferralsService,
        DocumentsService,
        PatientsService,
        EncountersService,
        CommentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: AuditService, useValue: mockAudit },
        { provide: EventService, useValue: mockEvent },
      ],
    }).compile();

    validationService = module.get<ValidationService>(ValidationService);
    referralsService = module.get<ReferralsService>(ReferralsService);
    documentsService = module.get<DocumentsService>(DocumentsService);
    patientsService = module.get<PatientsService>(PatientsService);
    encountersService = module.get<EncountersService>(EncountersService);
    commentsService = module.get<CommentsService>(CommentsService);
    auditService = module.get<AuditService>(AuditService);
  });

  describe('1. Empty Scopes Must Fail Closed', () => {
    it('should deny scope access in ValidationService when user has empty scopes', async () => {
      const referral: any = {
        id: 'ref-1',
        site: 'site-a',
        state: 'FL',
        legalEntity: 'heals-fl',
      };

      const result = await validationService.checkScope(unscopedUser, referral);
      expect(result).toBe(false);
    });

    it('should return empty list in ReferralsService.findMany when user has empty scopes', async () => {
      const result = await referralsService.findMany({}, unscopedUser);
      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
      expect(mockPrisma.referral.findMany).not.toHaveBeenCalled();
    });

    it('should return empty list in PatientsService.findAll when user has empty scopes', async () => {
      const result = await patientsService.findAll({}, unscopedUser);
      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
      expect(mockPrisma.patient.findMany).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException in PatientsService.findById when user has empty scopes', async () => {
      mockPrisma.patient.findUnique.mockResolvedValue({
        id: 'pat-1',
        firstName: 'Jane',
        lastName: 'Doe',
        state: 'FL',
        referrals: [{ site: 'site-a', state: 'FL' }],
      });

      await expect(patientsService.findById('pat-1', unscopedUser)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should return empty list in DocumentsService.findAll when user has empty scopes', async () => {
      const result = await documentsService.findAll({}, unscopedUser);
      expect(result).toEqual([]);
      expect(mockPrisma.document.findMany).not.toHaveBeenCalled();
    });

    it('should allow Admin to bypass scope restrictions even with empty scopes array', async () => {
      const referral: any = {
        id: 'ref-1',
        site: 'site-a',
        state: 'FL',
        legalEntity: 'heals-fl',
      };

      const result = await validationService.checkScope(adminUser, referral);
      expect(result).toBe(true);
    });
  });

  describe('2. PHI Exposure & Minimum Necessary Projections', () => {
    it('should mask MRN and phone numbers in ReferralsService.findMany for queue views', async () => {
      mockPrisma.referral.findMany.mockResolvedValue([
        {
          id: 'ref-100',
          pipelineStage: PipelineStage.INTAKE,
          workStatus: WorkStatus.PENDING,
          site: 'site-a',
          state: 'FL',
          patient: {
            id: 'pat-100',
            firstName: 'Eleanor',
            lastName: 'Vance',
            dateOfBirth: new Date('1954-08-12'),
            medicalRecordNumber: 'MRN-987654321',
            phone: '5551234567',
          },
        },
      ]);
      mockPrisma.referral.count.mockResolvedValue(1);

      const scopedUser: AuthTokenPayload = {
        ...unscopedUser,
        scopes: { sites: ['site-a'], states: ['FL'], legalEntities: [] },
      };

      const result = await referralsService.findMany({}, scopedUser);
      expect(result.data.length).toBe(1);

      const patient = (result.data[0] as any).patient;
      // MRN must be masked with only last 4 visible
      expect(patient.medicalRecordNumber).toBe('MRN-***4321');
      // Phone must be masked with only last 4 visible
      expect(patient.phone).toBe('(***) ***-4567');
      // Tracking number should be synthesized if not explicitly set
      expect((result.data[0] as any).trackingNumber).toBe('REF-REF-100');
    });

    it('should log PHI access when patient details are retrieved by ID', async () => {
      mockPrisma.patient.findUnique.mockResolvedValue({
        id: 'pat-200',
        firstName: 'Arthur',
        lastName: 'Dent',
        state: 'FL',
        referrals: [{ site: 'site-a', state: 'FL' }],
      });

      const scopedUser: AuthTokenPayload = {
        ...unscopedUser,
        scopes: { sites: ['site-a'], states: ['FL'], legalEntities: [] },
      };

      await patientsService.findById('pat-200', scopedUser);
      expect(mockAudit.logPhiAccess).toHaveBeenCalledWith(
        scopedUser.userId,
        'PATIENT',
        'pat-200',
        expect.stringContaining('Dent'),
      );
    });
  });

  describe('3. Document Authorization & Clinical Records Isolation', () => {
    it('should forbid non-clinical roles (Billing Coordinator) from accessing CLINICAL_NOTE documents', async () => {
      const clinicalDoc: any = {
        id: 'doc-note-1',
        referralId: 'ref-1',
        type: DocumentType.CLINICAL_NOTE,
        originalFilename: 'progress-note.pdf',
        mimeType: 'application/pdf',
        storagePath: 'd:/ReferralSystem/uploads/note.pdf',
        referral: { id: 'ref-1', site: 'site-a', state: 'FL' },
      };

      mockPrisma.document.findUnique.mockResolvedValue(clinicalDoc);

      await expect(
        documentsService.getFileStream('doc-note-1', billingUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow Clinical Reviewer to access CLINICAL_NOTE documents', async () => {
      const fs = require('fs');
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'createReadStream').mockReturnValue({ pipe: jest.fn() } as any);

      const clinicalDoc: any = {
        id: 'doc-note-2',
        referralId: 'ref-1',
        type: DocumentType.CLINICAL_NOTE,
        originalFilename: 'progress-note.pdf',
        mimeType: 'application/pdf',
        storagePath: 'd:/ReferralSystem/uploads/note.pdf',
        referral: { id: 'ref-1', site: 'site-a', state: 'FL' },
      };

      mockPrisma.document.findUnique.mockResolvedValue(clinicalDoc);

      const result = await documentsService.getFileStream('doc-note-2', clinicalReviewerUser);
      expect(result.document.id).toBe('doc-note-2');
      expect(mockAudit.recordEvent).toHaveBeenCalledWith(
        clinicalReviewerUser.userId,
        'VIEW',
        'DOCUMENT',
        'doc-note-2',
        undefined,
        undefined,
        expect.objectContaining({ action: 'DOWNLOAD', documentType: DocumentType.CLINICAL_NOTE }),
      );
    });
  });

  describe('4. Clinical Notes QA Authorization', () => {
    it('should prevent note review by users outside scope', async () => {
      mockPrisma.referral.findUnique.mockResolvedValue({
        id: 'ref-ga',
        site: 'site-b',
        state: 'GA',
      });

      // Clinical reviewer only has scope in FL / site-a
      await expect(
        encountersService.reviewNoteByReferral(
          'ref-ga',
          { decision: NoteReviewDecision.APPROVE },
          clinicalReviewerUser,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should prevent Admin without clinical credentials from approving or reviewing clinical notes', async () => {
      mockPrisma.referral.findUnique.mockResolvedValue({
        id: 'ref-admin-note',
        site: 'site-a',
        state: 'FL',
      });

      // Admin role must not have clinical authority to sign off on clinical documentation
      await expect(
        encountersService.reviewNoteByReferral(
          'ref-admin-note',
          { decision: NoteReviewDecision.APPROVE },
          adminUser,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should prevent Office Manager from reviewing or approving clinical notes', async () => {
      mockPrisma.referral.findUnique.mockResolvedValue({
        id: 'ref-om-note',
        site: 'site-a',
        state: 'FL',
      });

      await expect(
        encountersService.reviewNoteByReferral(
          'ref-om-note',
          { decision: NoteReviewDecision.APPROVE },
          officeManagerUser,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('5. Cross-Site & Cross-Role Manipulation Defenses', () => {
    it('should prevent user from accessing referral detail from another site (ID manipulation)', async () => {
      mockPrisma.referral.findUnique.mockResolvedValue({
        id: 'ref-cross-site',
        site: 'site-unauthorized',
        state: 'TX',
        legalEntity: 'heals-tx',
        patient: { id: 'pat-tx' },
        assignments: [],
      });

      // clinicalReviewerUser is only scoped to site-a / FL
      await expect(
        referralsService.findOne('ref-cross-site', clinicalReviewerUser),
      ).rejects.toThrow(NotFoundException);
    });

    it('should prevent user from downloading document attached to another site referral', async () => {
      mockPrisma.document.findUnique.mockResolvedValue({
        id: 'doc-other-site',
        referralId: 'ref-tx',
        type: DocumentType.REFERRAL_FORM,
        originalFilename: 'referral.pdf',
        mimeType: 'application/pdf',
        storagePath: 'd:/ReferralSystem/uploads/referral.pdf',
        referral: { id: 'ref-tx', site: 'site-tx', state: 'TX' },
      });

      await expect(
        documentsService.getFileStream('doc-other-site', clinicalReviewerUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject patient profile lookup if patient is linked only to unauthorized referrals', async () => {
      mockPrisma.patient.findUnique.mockResolvedValue({
        id: 'pat-other-state',
        firstName: 'John',
        lastName: 'Smith',
        state: 'TX',
        referrals: [{ site: 'site-tx', state: 'TX' }],
      });

      await expect(
        patientsService.findById('pat-other-state', clinicalReviewerUser),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('6. Referral Internal Comments API', () => {
    it('should create comment and audit the action when user is scoped', async () => {
      mockPrisma.referral.findUnique.mockResolvedValue({
        id: 'ref-comment-1',
        site: 'site-a',
        state: 'FL',
      });

      mockPrisma.comment.create.mockResolvedValue({
        id: 'comm-1',
        referralId: 'ref-comment-1',
        userId: officeManagerUser.userId,
        content: 'Clinical team reached out to caregiver. Follow-up scheduled.',
        mentions: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        user: {
          id: officeManagerUser.userId,
          firstName: 'Office',
          lastName: 'Manager',
          email: officeManagerUser.email,
          userRoles: [{ role: UserRole.OFFICE_MANAGER }],
        },
      });

      const res = await commentsService.createComment(
        'ref-comment-1',
        { content: 'Clinical team reached out to caregiver. Follow-up scheduled.' },
        officeManagerUser,
      );

      expect(res.id).toBe('comm-1');
      expect(res.author.name).toBe('Office Manager');
      expect(mockAudit.recordEvent).toHaveBeenCalledWith(
        officeManagerUser.userId,
        'CREATE',
        'COMMENT',
        'comm-1',
        undefined,
        undefined,
        expect.objectContaining({ referralId: 'ref-comment-1' }),
      );
    });

    it('should fail-closed when unscoped user tries to add comment', async () => {
      mockPrisma.referral.findUnique.mockResolvedValue({
        id: 'ref-comment-2',
        site: 'site-a',
        state: 'FL',
      });

      await expect(
        commentsService.createComment(
          'ref-comment-2',
          { content: 'Unauthorized comment attempt' },
          unscopedUser,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
