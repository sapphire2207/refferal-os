import { Test, TestingModule } from '@nestjs/testing';
import { ReferralsService } from './referrals.service';
import { PrismaService } from '../../../database/prisma.service';
import { RedisService } from '../../../redis/redis.service';
import { ValidationService } from './validation.service';
import { EventService } from './event.service';
import {
  UserRole,
  AuthTokenPayload,
  PipelineStage,
  WorkStatus,
} from '@heals/types';
import {
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { VersionConflictException } from '../exceptions/workflow.exceptions';

describe('ReferralsService', () => {
  let service: ReferralsService;
  let prisma: jest.Mocked<PrismaService>;
  let validationService: jest.Mocked<ValidationService>;
  let eventService: jest.Mocked<EventService>;
  let redisService: jest.Mocked<RedisService>;

  const mockUser: AuthTokenPayload = {
    userId: 'user-auth-1',
    email: 'intake@heals.com',
    sessionId: 'session-1',
    iat: 1000000,
    exp: 2000000,
    roles: [UserRole.INTAKE_SPECIALIST],
    scopes: {
      sites: ['Site-A'],
      states: ['FL'],
      legalEntities: ['HEALS_FL'],
    },
  };

  const mockReferral = {
    id: 'ref-1',
    patientId: 'patient-1',
    pipelineStage: PipelineStage.INTAKE,
    workStatus: WorkStatus.PENDING,
    version: 1,
    site: 'Site-A',
    state: 'FL',
    legalEntity: 'HEALS_FL',
    referralSource: 'Dr. Smith',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockPrisma = {
    referral: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      groupBy: jest.fn(),
    },
    patient: {
      findUnique: jest.fn(),
    },
  };

  const mockValidationService = {
    checkScope: jest.fn(),
  };

  const mockEventService = {
    enqueueEvent: jest.fn(),
  };

  const mockRedisService = {
    del: jest.fn().mockResolvedValue(undefined),
    delPattern: jest.fn().mockResolvedValue(undefined),
    getJson: jest.fn().mockResolvedValue(null),
    setJson: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReferralsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedisService },
        { provide: ValidationService, useValue: mockValidationService },
        { provide: EventService, useValue: mockEventService },
      ],
    }).compile();

    service = module.get<ReferralsService>(ReferralsService);
    prisma = module.get(PrismaService);
    validationService = module.get(ValidationService);
    eventService = module.get(EventService);
    redisService = module.get(RedisService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================================
  // create Tests
  // ============================================================================
  describe('create', () => {
    it('should successfully create referral in INTAKE stage and enqueue event', async () => {
      mockPrisma.patient.findUnique.mockResolvedValue({ id: 'patient-1' } as any);
      mockPrisma.referral.create.mockResolvedValue(mockReferral as any);

      const result = await service.create(
        {
          patientId: 'patient-1',
          site: 'Site-A',
          state: 'FL',
          legalEntity: 'HEALS_FL',
          referralSource: 'Dr. Smith',
        },
        mockUser,
      );

      expect(result).toEqual(mockReferral);
      expect(mockPrisma.referral.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            patientId: 'patient-1',
            site: 'Site-A',
            state: 'FL',
            legalEntity: 'HEALS_FL',
            version: 1,
          }),
        }),
      );
      expect(mockEventService.enqueueEvent).toHaveBeenCalledWith(
        'referral.created',
        'ref-1',
        expect.anything(),
      );
    });

    it('should throw ForbiddenException if user lacks scope for site', async () => {
      await expect(
        service.create(
          {
            patientId: 'patient-1',
            site: 'Site-B', // Out of scope
            state: 'FL',
            legalEntity: 'HEALS_FL',
          },
          mockUser,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if patient does not exist', async () => {
      mockPrisma.patient.findUnique.mockResolvedValue(null);

      await expect(
        service.create(
          {
            patientId: 'nonexistent-patient',
            site: 'Site-A',
            state: 'FL',
            legalEntity: 'HEALS_FL',
          },
          mockUser,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ============================================================================
  // findOne Tests
  // ============================================================================
  describe('findOne', () => {
    it('should return referral if found and user has scope', async () => {
      mockPrisma.referral.findUnique.mockResolvedValue(mockReferral as any);
      mockValidationService.checkScope.mockResolvedValue(true);

      const result = await service.findOne('ref-1', mockUser);

      expect(result).toEqual(mockReferral);
      expect(mockPrisma.referral.findUnique).toHaveBeenCalledWith({
        where: { id: 'ref-1' },
        include: expect.any(Object),
      });
    });

    it('should throw NotFoundException if referral does not exist', async () => {
      mockPrisma.referral.findUnique.mockResolvedValue(null);

      await expect(service.findOne('nonexistent', mockUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException if user lacks scope to referral', async () => {
      mockPrisma.referral.findUnique.mockResolvedValue(mockReferral as any);
      mockValidationService.checkScope.mockResolvedValue(false);

      await expect(service.findOne('ref-1', mockUser)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ============================================================================
  // findMany Tests
  // ============================================================================
  describe('findMany', () => {
    it('should return paginated referrals constrained by user scopes', async () => {
      mockPrisma.referral.findMany.mockResolvedValue([mockReferral as any]);
      mockPrisma.referral.count.mockResolvedValue(1);

      const result = await service.findMany(
        { limit: 10, offset: 0, pipelineStage: PipelineStage.INTAKE },
        mockUser,
      );

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(mockPrisma.referral.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            site: { in: ['Site-A'] },
            state: { in: ['FL'] },
            legalEntity: { in: ['HEALS_FL'] },
            pipelineStage: PipelineStage.INTAKE,
          }),
          take: 10,
          skip: 0,
        }),
      );
    });

    it('should allow ADMIN to query without scope constraints', async () => {
      const adminUser: AuthTokenPayload = {
        userId: 'admin-1',
        email: 'admin@heals.com',
        sessionId: 'session-2',
        iat: 1000000,
        exp: 2000000,
        roles: [UserRole.ADMIN],
        scopes: { sites: [], states: [], legalEntities: [] },
      };

      mockPrisma.referral.findMany.mockResolvedValue([]);
      mockPrisma.referral.count.mockResolvedValue(0);

      await service.findMany({}, adminUser);

      expect(mockPrisma.referral.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {},
        }),
      );
    });
  });

  // ============================================================================
  // update Tests
  // ============================================================================
  describe('update', () => {
    it('should successfully update referral fields and increment version', async () => {
      mockPrisma.referral.findUnique.mockResolvedValue(mockReferral as any);
      mockValidationService.checkScope.mockResolvedValue(true);

      const updated = {
        ...mockReferral,
        referralSource: 'Updated Doctor',
        version: 2,
      };
      mockPrisma.referral.update.mockResolvedValue(updated as any);

      const result = await service.update(
        'ref-1',
        {
          version: 1,
          referralSource: 'Updated Doctor',
        },
        mockUser,
      );

      expect(result.version).toBe(2);
      expect(result.referralSource).toBe('Updated Doctor');
      expect(mockPrisma.referral.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'ref-1' },
          data: expect.objectContaining({
            referralSource: 'Updated Doctor',
            version: 2,
          }),
        }),
      );
    });

    it('should throw VersionConflictException when update version mismatches', async () => {
      mockPrisma.referral.findUnique.mockResolvedValue(mockReferral as any); // version 1
      mockValidationService.checkScope.mockResolvedValue(true);

      await expect(
        service.update(
          'ref-1',
          {
            version: 99, // mismatch
            referralSource: 'Mismatch Doctor',
          },
          mockUser,
        ),
      ).rejects.toThrow(VersionConflictException);
    });

    it('should throw ForbiddenException if user lacks scope', async () => {
      mockPrisma.referral.findUnique.mockResolvedValue(mockReferral as any);
      mockValidationService.checkScope.mockResolvedValue(false);

      await expect(
        service.update('ref-1', { version: 1 }, mockUser),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getDashboardMetrics', () => {
    it('should return cached dashboard metrics if present in Redis', async () => {
      const cachedMetrics = {
        totalActive: 10,
        byStage: { [PipelineStage.INTAKE]: 10 },
        byStatus: { [WorkStatus.PENDING]: 10 },
        overdue: 0,
        dueToday: 0,
      };
      mockRedisService.getJson.mockResolvedValue(cachedMetrics);

      const result = await service.getDashboardMetrics(mockUser);

      expect(result).toEqual(cachedMetrics);
      expect(mockRedisService.getJson).toHaveBeenCalledWith(`dashboard:metrics:${mockUser.userId}`);
      expect(mockPrisma.referral.groupBy).not.toHaveBeenCalled();
    });

    it('should compute metrics from DB and cache in Redis on cache miss', async () => {
      mockRedisService.getJson.mockResolvedValue(null);
      mockPrisma.referral.groupBy
        .mockResolvedValueOnce([
          { pipelineStage: PipelineStage.INTAKE, _count: 5 },
          { pipelineStage: PipelineStage.CLINICAL_REVIEW, _count: 3 },
        ])
        .mockResolvedValueOnce([
          { workStatus: WorkStatus.PENDING, _count: 4 },
          { workStatus: WorkStatus.IN_PROGRESS, _count: 4 },
        ]);

      const result = await service.getDashboardMetrics(mockUser);

      expect(result.totalActive).toBe(8);
      expect(result.byStage[PipelineStage.INTAKE]).toBe(5);
      expect(result.byStage[PipelineStage.CLINICAL_REVIEW]).toBe(3);
      expect(result.byStatus[WorkStatus.PENDING]).toBe(4);
      expect(result.byStatus[WorkStatus.IN_PROGRESS]).toBe(4);
      expect(mockRedisService.setJson).toHaveBeenCalledWith(
        `dashboard:metrics:${mockUser.userId}`,
        expect.any(Object),
        60,
      );
    });
  });
});
