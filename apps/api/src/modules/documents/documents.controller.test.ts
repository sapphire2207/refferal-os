import { Test, TestingModule } from '@nestjs/testing';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { DistributedRateLimiterService } from '../../common/services/rate-limiter.service';
import { UserRole, AuthTokenPayload, DocumentType } from '@heals/types';

describe('DocumentsController', () => {
  let controller: DocumentsController;
  let service: any;
  let rateLimiter: any;

  const mockUser: AuthTokenPayload = {
    userId: 'user-001',
    email: 'reviewer@heals.com',
    roles: [UserRole.CLINICAL_REVIEWER],
    scopes: { sites: [], states: [], legalEntities: [] },
    sessionId: 'sess-001',
    iat: 1,
    exp: 999999,
  };

  beforeEach(async () => {
    service = {
      uploadDocument: jest.fn().mockResolvedValue({ id: 'doc-1' }),
      findAll: jest.fn().mockResolvedValue([{ id: 'doc-1' }]),
      findById: jest.fn().mockResolvedValue({ id: 'doc-1' }),
      getFileStream: jest.fn().mockResolvedValue({
        stream: { pipe: jest.fn() },
        document: { mimeType: 'application/pdf', originalFilename: 'order.pdf' },
      }),
      verifyDocument: jest.fn().mockResolvedValue({ id: 'doc-1', verifiedAt: new Date() }),
      extractDocument: jest.fn().mockResolvedValue({ id: 'doc-1', extractionStatus: 'COMPLETED' }),
      deleteDocument: jest.fn().mockResolvedValue({ success: true }),
    };

    rateLimiter = {
      enforce: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DocumentsController],
      providers: [
        { provide: DocumentsService, useValue: service },
        { provide: DistributedRateLimiterService, useValue: rateLimiter },
      ],
    }).compile();

    controller = module.get<DocumentsController>(DocumentsController);
  });

  describe('upload', () => {
    it('should rate limit upload and delegate to service', async () => {
      const dto = { referralId: 'ref-1', type: DocumentType.REFERRAL_FORM };
      const file: any = { originalname: 'order.pdf' };
      const req = { ip: '127.0.0.1' } as any;

      await controller.upload(dto, file, mockUser, req);

      expect(rateLimiter.enforce).toHaveBeenCalledWith('api-upload', '127.0.0.1');
      expect(service.uploadDocument).toHaveBeenCalledWith(dto, file, mockUser);
    });
  });

  describe('findAll', () => {
    it('should return documents list', async () => {
      const res = await controller.findAll({ referralId: 'ref-1' }, mockUser);
      expect(service.findAll).toHaveBeenCalledWith({ referralId: 'ref-1' }, mockUser);
      expect(res).toHaveLength(1);
    });
  });

  describe('findById', () => {
    it('should return single document', async () => {
      const res = await controller.findById('doc-1', mockUser);
      expect(service.findById).toHaveBeenCalledWith('doc-1', mockUser);
      expect(res.id).toBe('doc-1');
    });
  });

  describe('download', () => {
    it('should stream file with security headers', async () => {
      const res: any = {
        setHeader: jest.fn(),
      };

      await controller.download('doc-1', mockUser, res);

      expect(service.getFileStream).toHaveBeenCalledWith('doc-1', mockUser);
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
      expect(res.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
    });
  });

  describe('verify', () => {
    it('should delegate verification to service', async () => {
      const dto = { verificationNotes: 'Approved' };
      await controller.verify('doc-1', dto, mockUser);
      expect(service.verifyDocument).toHaveBeenCalledWith('doc-1', dto, mockUser);
    });
  });

  describe('extract', () => {
    it('should trigger AI extraction pipeline', async () => {
      await controller.extract('doc-1', mockUser);
      expect(service.extractDocument).toHaveBeenCalledWith('doc-1', mockUser);
    });
  });

  describe('delete', () => {
    it('should delete document', async () => {
      await controller.delete('doc-1', mockUser);
      expect(service.deleteDocument).toHaveBeenCalledWith('doc-1', mockUser);
    });
  });
});
