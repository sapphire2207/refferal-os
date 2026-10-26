import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { AuditService } from './audit.service';
import { PrismaService } from '../../database/prisma.service';
import { UserRole, AuthTokenPayload } from '@heals/types';
import { AuditAction } from './dto/audit.dto';

describe('AuditService', () => {
  let service: AuditService;
  let prisma: any;

  const mockAuditEvent = {
    id: 'audit-001',
    userId: 'user-001',
    action: AuditAction.STAGE_TRANSITION,
    entityType: 'Referral',
    entityId: 'ref-001',
    before: { stage: 'INTAKE' },
    after: { stage: 'CLINICAL_REVIEW' },
    metadata: { reason: 'Demographics complete' },
    ipAddress: '127.0.0.1',
    userAgent: 'Mozilla/5.0',
    timestamp: new Date('2026-01-01'),
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

  const staffUser: AuthTokenPayload = {
    userId: 'staff-1',
    email: 'staff@heals.com',
    roles: [UserRole.INTAKE_SPECIALIST],
    scopes: { sites: [], states: [], legalEntities: [] },
    sessionId: 'sess-staff',
    iat: 1,
    exp: 999999,
  };

  beforeEach(async () => {
    prisma = {
      auditEvent: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<AuditService>(AuditService);
  });

  describe('recordEvent', () => {
    it('should create audit event record', async () => {
      prisma.auditEvent.create.mockResolvedValue(mockAuditEvent);

      const res = await service.recordEvent(
        'user-001',
        AuditAction.STAGE_TRANSITION,
        'Referral',
        'ref-001',
        { stage: 'INTAKE' },
        { stage: 'CLINICAL_REVIEW' },
        { reason: 'Demographics complete' },
        '127.0.0.1',
        'Mozilla/5.0',
      );

      expect(res?.id).toBe(mockAuditEvent.id);
      expect(prisma.auditEvent.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-001',
          action: AuditAction.STAGE_TRANSITION,
          entityType: 'Referral',
          entityId: 'ref-001',
          before: { stage: 'INTAKE' },
          after: { stage: 'CLINICAL_REVIEW' },
          metadata: { reason: 'Demographics complete' },
          ipAddress: '127.0.0.1',
          userAgent: 'Mozilla/5.0',
        },
      });
    });
  });

  describe('logPhiAccess', () => {
    it('should log PHI access event with VIEW action', async () => {
      prisma.auditEvent.create.mockResolvedValue({
        ...mockAuditEvent,
        action: AuditAction.VIEW,
      });

      await service.logPhiAccess(
        'user-001',
        'PatientChart',
        'pat-001',
        'Routine review',
        '10.0.0.1',
      );

      expect(prisma.auditEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: AuditAction.VIEW,
            entityType: 'PatientChart',
            entityId: 'pat-001',
            metadata: { accessType: 'PHI_ACCESS', reason: 'Routine review' },
          }),
        }),
      );
    });
  });

  describe('queryLogs', () => {
    it('should allow Admin to query audit logs', async () => {
      prisma.auditEvent.count.mockResolvedValue(1);
      prisma.auditEvent.findMany.mockResolvedValue([mockAuditEvent]);

      const res = await service.queryLogs({ page: 1, limit: 10, entityType: 'Referral' }, adminUser);

      expect(res.total).toBe(1);
      expect(res.data).toHaveLength(1);
    });

    it('should throw ForbiddenException if regular staff tries to query audit logs', async () => {
      await expect(
        service.queryLogs({ page: 1, limit: 10 }, staffUser),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('findById', () => {
    it('should retrieve audit event for Admin', async () => {
      prisma.auditEvent.findUnique.mockResolvedValue(mockAuditEvent);

      const res = await service.findById(mockAuditEvent.id, adminUser);
      expect(res.id).toBe(mockAuditEvent.id);
    });

    it('should throw NotFoundException if event does not exist', async () => {
      prisma.auditEvent.findUnique.mockResolvedValue(null);

      await expect(service.findById('unknown-id', adminUser)).rejects.toThrow(NotFoundException);
    });
  });
});
