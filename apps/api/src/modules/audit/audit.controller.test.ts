import { Test, TestingModule } from '@nestjs/testing';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';
import { UserRole, AuthTokenPayload } from '@heals/types';

describe('AuditController', () => {
  let controller: AuditController;
  let service: any;

  const mockAdmin: AuthTokenPayload = {
    userId: 'admin-1',
    email: 'admin@heals.com',
    roles: [UserRole.ADMIN],
    scopes: { sites: [], states: [], legalEntities: [] },
    sessionId: 'sess-admin',
    iat: 1,
    exp: 999999,
  };

  beforeEach(async () => {
    service = {
      queryLogs: jest.fn().mockResolvedValue({ data: [], total: 0 }),
      findById: jest.fn().mockResolvedValue({ id: 'audit-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuditController],
      providers: [
        { provide: AuditService, useValue: service },
      ],
    }).compile();

    controller = module.get<AuditController>(AuditController);
  });

  describe('queryLogs', () => {
    it('should query audit logs', async () => {
      const res = await controller.queryLogs({ page: 1, limit: 10 }, mockAdmin);
      expect(service.queryLogs).toHaveBeenCalledWith({ page: 1, limit: 10 }, mockAdmin);
      expect(res.data).toEqual([]);
    });
  });

  describe('findById', () => {
    it('should retrieve audit event by ID', async () => {
      const res = await controller.findById('audit-1', mockAdmin);
      expect(service.findById).toHaveBeenCalledWith('audit-1', mockAdmin);
      expect(res.id).toBe('audit-1');
    });
  });
});
