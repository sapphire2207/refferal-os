import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import * as fs from 'fs';
import { DocumentsService } from './documents.service';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UserRole, AuthTokenPayload, DocumentType, ExtractionStatus } from '@heals/types';

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn().mockReturnValue(true),
  mkdirSync: jest.fn(),
  promises: {
    writeFile: jest.fn().mockResolvedValue(undefined),
    unlink: jest.fn().mockResolvedValue(undefined),
  },
  createReadStream: jest.fn().mockReturnValue({ pipe: jest.fn() }),
}));

describe('DocumentsService', () => {
  let service: DocumentsService;
  let prisma: any;

  const mockReferral = {
    id: 'ref-101',
    patientId: 'pat-101',
    site: 'FL-MIAMI',
    state: 'FL',
    legalEntity: 'HEALS_FL',
  };

  const mockDocument = {
    id: 'doc-001',
    referralId: 'ref-101',
    type: DocumentType.REFERRAL_FORM,
    filename: 'doc-uuid-123.pdf',
    originalFilename: 'Clinical_Order.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1024,
    storagePath: 'storage/documents/doc-uuid-123.pdf',
    uploadedById: 'user-001',
    uploadedAt: new Date('2026-01-01'),
    extractionStatus: ExtractionStatus.PENDING,
    extractionData: null,
    confidenceScore: null,
    verifiedAt: null,
    verifiedById: null,
    verificationNotes: null,
    referral: mockReferral,
  };

  const adminUser: AuthTokenPayload = {
    userId: 'admin-1',
    email: 'admin@heals.com',
    roles: [UserRole.ADMIN],
    scopes: { sites: [], states: [], legalEntities: [] },
    sessionId: 'sess-admin',
    iat: 1,
    exp: 999999,
  };

  const flStaffUser: AuthTokenPayload = {
    userId: 'staff-fl',
    email: 'staff@heals.com',
    roles: [UserRole.INTAKE_SPECIALIST],
    scopes: { sites: ['FL-MIAMI'], states: ['FL'], legalEntities: [] },
    sessionId: 'sess-fl',
    iat: 1,
    exp: 999999,
  };

  const gaStaffUser: AuthTokenPayload = {
    userId: 'staff-ga',
    email: 'ga@heals.com',
    roles: [UserRole.INTAKE_SPECIALIST],
    scopes: { sites: ['GA-ATLANTA'], states: ['GA'], legalEntities: [] },
    sessionId: 'sess-ga',
    iat: 1,
    exp: 999999,
  };

  beforeEach(async () => {
    prisma = {
      referral: {
        findUnique: jest.fn(),
      },
      document: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentsService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: AuditService,
          useValue: {
            recordEvent: jest.fn().mockResolvedValue({ id: 'audit-doc-1' }),
            logPhiAccess: jest.fn().mockResolvedValue({ id: 'audit-doc-1' }),
          },
        },
      ],
    }).compile();

    service = module.get<DocumentsService>(DocumentsService);
  });

  describe('validateFile', () => {
    it('should validate valid PDF with %PDF magic bytes', () => {
      const pdfBuffer = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
      const file: any = {
        buffer: pdfBuffer,
        size: pdfBuffer.length,
        mimetype: 'application/pdf',
        originalname: 'test.pdf',
      };

      expect(() => service.validateFile(file)).not.toThrow();
    });

    it('should validate valid JPEG magic bytes', () => {
      const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
      const file: any = {
        buffer: jpegBuffer,
        size: jpegBuffer.length,
        mimetype: 'image/jpeg',
        originalname: 'photo.jpg',
      };

      expect(() => service.validateFile(file)).not.toThrow();
    });

    it('should throw BadRequestException when binary magic bytes are malicious or spoofed', () => {
      // HTML/script disguised as PDF
      const fakeBuffer = Buffer.from('<script>alert("hacked")</script>');
      const file: any = {
        buffer: fakeBuffer,
        size: fakeBuffer.length,
        mimetype: 'application/pdf',
        originalname: 'fake.pdf',
      };

      expect(() => service.validateFile(file)).toThrow(BadRequestException);
    });

    it('should throw BadRequestException when file size exceeds 25MB limit', () => {
      const largeFile: any = {
        buffer: Buffer.from([0x25, 0x50, 0x44, 0x46]),
        size: 26 * 1024 * 1024, // 26MB
        mimetype: 'application/pdf',
        originalname: 'huge.pdf',
      };

      expect(() => service.validateFile(largeFile)).toThrow(BadRequestException);
    });
  });

  describe('uploadDocument', () => {
    it('should throw NotFoundException if referral does not exist', async () => {
      prisma.referral.findUnique.mockResolvedValue(null);

      const file: any = {
        buffer: Buffer.from([0x25, 0x50, 0x44, 0x46]),
        size: 4,
        mimetype: 'application/pdf',
        originalname: 'order.pdf',
      };

      await expect(
        service.uploadDocument(
          { referralId: 'non-existent', type: DocumentType.CLINICAL_ORDER },
          file,
          adminUser,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user lacks location scope for referral', async () => {
      prisma.referral.findUnique.mockResolvedValue(mockReferral); // FL referral

      const file: any = {
        buffer: Buffer.from([0x25, 0x50, 0x44, 0x46]),
        size: 4,
        mimetype: 'application/pdf',
        originalname: 'order.pdf',
      };

      // gaStaffUser is only authorized for GA
      await expect(
        service.uploadDocument(
          { referralId: mockReferral.id, type: DocumentType.CLINICAL_ORDER },
          file,
          gaStaffUser,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should write file to disk and record document in Prisma', async () => {
      prisma.referral.findUnique.mockResolvedValue(mockReferral);
      prisma.document.create.mockResolvedValue(mockDocument);

      const file: any = {
        buffer: Buffer.from([0x25, 0x50, 0x44, 0x46]),
        size: 4,
        mimetype: 'application/pdf',
        originalname: 'Clinical_Order.pdf',
      };

      const result = await service.uploadDocument(
        { referralId: mockReferral.id, type: DocumentType.REFERRAL_FORM },
        file,
        flStaffUser,
      );

      expect(result.id).toBe(mockDocument.id);
      expect(fs.promises.writeFile).toHaveBeenCalled();
      expect(prisma.document.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            referralId: mockReferral.id,
            type: DocumentType.REFERRAL_FORM,
            originalFilename: 'Clinical_Order.pdf',
            uploadedById: flStaffUser.userId,
            extractionStatus: ExtractionStatus.PENDING,
          }),
        }),
      );
    });
  });

  describe('findAll', () => {
    it('should return documents with scope filtering', async () => {
      prisma.document.findMany.mockResolvedValue([mockDocument]);

      const res = await service.findAll({ referralId: mockReferral.id }, flStaffUser);

      expect(res).toHaveLength(1);
      expect(prisma.document.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            referralId: mockReferral.id,
            referral: expect.objectContaining({
              OR: expect.any(Array),
            }),
          }),
        }),
      );
    });
  });

  describe('findById', () => {
    it('should return document if authorized', async () => {
      prisma.document.findUnique.mockResolvedValue(mockDocument);

      const res = await service.findById(mockDocument.id, flStaffUser);
      expect(res.id).toBe(mockDocument.id);
    });

    it('should throw ForbiddenException if user scope does not match', async () => {
      prisma.document.findUnique.mockResolvedValue(mockDocument); // FL referral

      await expect(service.findById(mockDocument.id, gaStaffUser)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('verifyDocument', () => {
    it('should update verification metadata and confirmed extraction fields', async () => {
      prisma.document.findUnique.mockResolvedValue(mockDocument);
      prisma.document.update.mockResolvedValue({
        ...mockDocument,
        verifiedAt: new Date(),
        verifiedById: flStaffUser.userId,
        verificationNotes: 'Manually verified',
      });

      const res = await service.verifyDocument(
        mockDocument.id,
        {
          verificationNotes: 'Manually verified',
          confirmedData: { coverageVerified: true },
        },
        flStaffUser,
      );

      expect(res.verificationNotes).toBe('Manually verified');
      expect(prisma.document.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockDocument.id },
          data: expect.objectContaining({
            verifiedById: flStaffUser.userId,
            verificationNotes: 'Manually verified',
          }),
        }),
      );
    });
  });

  describe('extractDocument', () => {
    it('should return safe unconfigured result when AI service credentials are not configured', async () => {
      prisma.document.findUnique.mockResolvedValue(mockDocument);
      prisma.document.update.mockResolvedValue({
        ...mockDocument,
        extractionStatus: ExtractionStatus.FAILED,
        confidenceScore: 0.0,
        extractionData: null,
        extractionError:
          'AI extraction engine is currently not configured. Document has been securely preserved for manual staff intake and verification.',
      });

      const res = await service.extractDocument(mockDocument.id, flStaffUser);

      expect(res.extractionStatus).toBe(ExtractionStatus.FAILED);
      expect(res.confidenceScore).toBe(0.0);
      expect(prisma.document.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockDocument.id },
          data: expect.objectContaining({
            extractionStatus: ExtractionStatus.FAILED,
            confidenceScore: 0.0,
            extractionData: null,
          }),
        }),
      );
    });
  });

  describe('deleteDocument', () => {
    it('should delete unverified document and unlink file', async () => {
      prisma.document.findUnique.mockResolvedValue(mockDocument); // verifiedAt is null
      prisma.document.delete.mockResolvedValue(mockDocument);

      const res = await service.deleteDocument(mockDocument.id, flStaffUser);

      expect(res.success).toBe(true);
      expect(fs.promises.unlink).toHaveBeenCalledWith(mockDocument.storagePath);
      expect(prisma.document.delete).toHaveBeenCalledWith({ where: { id: mockDocument.id } });
    });

    it('should reject deletion of verified document by non-admin', async () => {
      prisma.document.findUnique.mockResolvedValue({
        ...mockDocument,
        verifiedAt: new Date(),
        verifiedById: 'some-user',
      });

      await expect(service.deleteDocument(mockDocument.id, flStaffUser)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should allow deletion of verified document by admin', async () => {
      prisma.document.findUnique.mockResolvedValue({
        ...mockDocument,
        verifiedAt: new Date(),
        verifiedById: 'some-user',
      });
      prisma.document.delete.mockResolvedValue(mockDocument);

      const res = await service.deleteDocument(mockDocument.id, adminUser);
      expect(res.success).toBe(true);
    });
  });
});
