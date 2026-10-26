import { Test, TestingModule } from '@nestjs/testing';
import { PatientsController } from './patients.controller';
import { PatientsService } from './patients.service';
import { DistributedRateLimiterService } from '../../common/services/rate-limiter.service';
import { UserRole, AuthTokenPayload } from '@heals/types';

describe('PatientsController', () => {
  let controller: PatientsController;
  let service: any;
  let rateLimiter: any;

  const mockUser: AuthTokenPayload = {
    userId: 'user-001',
    email: 'intake@heals.com',
    roles: [UserRole.INTAKE_SPECIALIST],
    scopes: { sites: ['FL-MIAMI'], states: ['FL'], legalEntities: [] },
    sessionId: 'sess-001',
    iat: 123456,
    exp: 999999,
  };

  beforeEach(async () => {
    service = {
      findAll: jest.fn().mockResolvedValue({ data: [], total: 0 }),
      checkDuplicates: jest.fn().mockResolvedValue([]),
      findById: jest.fn().mockResolvedValue({ id: 'pat-1' }),
      create: jest.fn().mockResolvedValue({ id: 'pat-1' }),
      update: jest.fn().mockResolvedValue({ id: 'pat-1' }),
      delete: jest.fn().mockResolvedValue({ success: true }),
    };

    rateLimiter = {
      enforce: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PatientsController],
      providers: [
        { provide: PatientsService, useValue: service },
        { provide: DistributedRateLimiterService, useValue: rateLimiter },
      ],
    }).compile();

    controller = module.get<PatientsController>(PatientsController);
  });

  describe('findAll', () => {
    it('should rate limit and return patients list', async () => {
      const req = { ip: '127.0.0.1' } as any;
      await controller.findAll({ page: 1, limit: 10 }, mockUser, req);

      expect(rateLimiter.enforce).toHaveBeenCalledWith('api-search', '127.0.0.1');
      expect(service.findAll).toHaveBeenCalledWith({ page: 1, limit: 10 }, mockUser);
    });
  });

  describe('checkDuplicates', () => {
    it('should rate limit and return duplicate matches', async () => {
      const req = { ip: '127.0.0.1' } as any;
      const candidate = {
        firstName: 'Eleanor',
        lastName: 'Vance',
        dateOfBirth: '1954-08-12',
      };

      await controller.checkDuplicates(candidate, req, mockUser);

      expect(rateLimiter.enforce).toHaveBeenCalledWith('api-search', '127.0.0.1');
      expect(service.checkDuplicates).toHaveBeenCalledWith(candidate);
    });
  });

  describe('findById', () => {
    it('should retrieve patient by ID', async () => {
      const res = await controller.findById('pat-1', mockUser);
      expect(service.findById).toHaveBeenCalledWith('pat-1', mockUser);
      expect(res.id).toBe('pat-1');
    });
  });

  describe('create', () => {
    it('should create new patient', async () => {
      const dto = {
        firstName: 'Eleanor',
        lastName: 'Vance',
        dateOfBirth: '1954-08-12',
      };

      await controller.create(dto, mockUser);
      expect(service.create).toHaveBeenCalledWith(dto, mockUser);
    });
  });

  describe('update', () => {
    it('should update patient demographics', async () => {
      await controller.update('pat-1', { phone: '123' }, mockUser);
      expect(service.update).toHaveBeenCalledWith('pat-1', { phone: '123' }, mockUser);
    });
  });

  describe('delete', () => {
    it('should delete patient', async () => {
      await controller.delete('pat-1', mockUser);
      expect(service.delete).toHaveBeenCalledWith('pat-1', mockUser);
    });
  });
});
