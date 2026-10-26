import { Test, TestingModule } from '@nestjs/testing';
import { ValidationService } from './validation.service';
import { PrismaService } from '../../../database/prisma.service';
import { RedisService } from '../../../redis/redis.service';
import { AuthTokenPayload, UserRole } from '@heals/types';
import { Referral } from '@prisma/client';

describe('ValidationService', () => {
  let service: ValidationService;
  let redisService: jest.Mocked<RedisService>;
  let prismaService: jest.Mocked<PrismaService>;

  const mockReferral: Partial<Referral> = {
    id: 'ref-123',
    pipelineStage: 'INTAKE',
    site: 'SITE_1',
    state: 'CA',
    legalEntity: 'ENTITY_1',
    version: 1,
  };

  beforeEach(async () => {
    const mockRedisService = {
      getJson: jest.fn(),
      setJson: jest.fn(),
    };

    const mockPrismaService = {};

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ValidationService,
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<ValidationService>(ValidationService);
    redisService = module.get(RedisService);
    prismaService = module.get(PrismaService);
  });

  describe('checkAuthorization', () => {
    it('should return true for ADMIN role without checking permissions', async () => {
      const adminUser: AuthTokenPayload = {
        userId: 'user-1',
        email: 'admin@example.com',
        roles: [UserRole.ADMIN],
        scopes: {
          sites: ['SITE_1'],
          states: ['CA'],
          legalEntities: ['ENTITY_1'],
        },
        sessionId: 'session-1',
        iat: Date.now(),
        exp: Date.now() + 3600000,
      };

      const result = await service.checkAuthorization(
        adminUser,
        'referrals.transition.to_clinical_review',
        mockReferral as Referral,
      );

      expect(result).toBe(true);
      expect(redisService.getJson).not.toHaveBeenCalled();
    });

    it('should return true when user has required permission (from cache)', async () => {
      const intakeUser: AuthTokenPayload = {
        userId: 'user-2',
        email: 'intake@example.com',
        roles: [UserRole.INTAKE_SPECIALIST],
        scopes: {
          sites: ['SITE_1'],
          states: ['CA'],
          legalEntities: ['ENTITY_1'],
        },
        sessionId: 'session-2',
        iat: Date.now(),
        exp: Date.now() + 3600000,
      };

      redisService.getJson.mockResolvedValue([
        'referrals.view',
        'referrals.transition.to_clinical_review',
        'referrals.create',
      ]);

      const result = await service.checkAuthorization(
        intakeUser,
        'referrals.transition.to_clinical_review',
        mockReferral as Referral,
      );

      expect(result).toBe(true);
      expect(redisService.getJson).toHaveBeenCalledWith('user:permissions:user-2');
    });

    it('should return false when user lacks required permission (from cache)', async () => {
      const billingUser: AuthTokenPayload = {
        userId: 'user-3',
        email: 'billing@example.com',
        roles: [UserRole.BILLING_COORDINATOR],
        scopes: {
          sites: ['SITE_1'],
          states: ['CA'],
          legalEntities: ['ENTITY_1'],
        },
        sessionId: 'session-3',
        iat: Date.now(),
        exp: Date.now() + 3600000,
      };

      redisService.getJson.mockResolvedValue([
        'referrals.view',
        'referrals.transition.to_billing',
        'claims.create',
      ]);

      const result = await service.checkAuthorization(
        billingUser,
        'referrals.transition.to_clinical_review',
        mockReferral as Referral,
      );

      expect(result).toBe(false);
    });

    it('should compute and cache permissions on cache miss', async () => {
      const clinicalUser: AuthTokenPayload = {
        userId: 'user-4',
        email: 'clinical@example.com',
        roles: [UserRole.CLINICAL_REVIEWER],
        scopes: {
          sites: ['SITE_1'],
          states: ['CA'],
          legalEntities: ['ENTITY_1'],
        },
        sessionId: 'session-4',
        iat: Date.now(),
        exp: Date.now() + 3600000,
      };

      redisService.getJson.mockResolvedValue(null); // Cache miss
      redisService.setJson.mockResolvedValue(undefined);

      const result = await service.checkAuthorization(
        clinicalUser,
        'referrals.transition.to_scheduling',
        mockReferral as Referral,
      );

      expect(result).toBe(true);
      expect(redisService.getJson).toHaveBeenCalledWith('user:permissions:user-4');
      expect(redisService.setJson).toHaveBeenCalledWith(
        'user:permissions:user-4',
        expect.arrayContaining(['referrals.transition.to_scheduling']),
        300, // PERMISSION_CACHE_TTL
      );
    });

    it('should handle multiple roles correctly', async () => {
      const multiRoleUser: AuthTokenPayload = {
        userId: 'user-5',
        email: 'multi@example.com',
        roles: [UserRole.INTAKE_SPECIALIST, UserRole.CLINICAL_REVIEWER],
        scopes: {
          sites: ['SITE_1'],
          states: ['CA'],
          legalEntities: ['ENTITY_1'],
        },
        sessionId: 'session-5',
        iat: Date.now(),
        exp: Date.now() + 3600000,
      };

      redisService.getJson.mockResolvedValue(null);
      redisService.setJson.mockResolvedValue(undefined);

      // Should have permissions from both roles
      const result1 = await service.checkAuthorization(
        multiRoleUser,
        'referrals.transition.to_clinical_review', // INTAKE_SPECIALIST permission
        mockReferral as Referral,
      );

      const result2 = await service.checkAuthorization(
        multiRoleUser,
        'referrals.transition.to_scheduling', // CLINICAL_REVIEWER permission
        mockReferral as Referral,
      );

      expect(result1).toBe(true);
      expect(result2).toBe(true);
    });

    it('should continue without cache on Redis read error', async () => {
      const intakeUser: AuthTokenPayload = {
        userId: 'user-6',
        email: 'intake2@example.com',
        roles: [UserRole.INTAKE_SPECIALIST],
        scopes: {
          sites: ['SITE_1'],
          states: ['CA'],
          legalEntities: ['ENTITY_1'],
        },
        sessionId: 'session-6',
        iat: Date.now(),
        exp: Date.now() + 3600000,
      };

      redisService.getJson.mockRejectedValue(new Error('Redis connection failed'));
      redisService.setJson.mockResolvedValue(undefined);

      const result = await service.checkAuthorization(
        intakeUser,
        'referrals.transition.to_clinical_review',
        mockReferral as Referral,
      );

      expect(result).toBe(true);
    });

    it('should continue without cache on Redis write error', async () => {
      const schedulerUser: AuthTokenPayload = {
        userId: 'user-7',
        email: 'scheduler@example.com',
        roles: [UserRole.SCHEDULER],
        scopes: {
          sites: ['SITE_1'],
          states: ['CA'],
          legalEntities: ['ENTITY_1'],
        },
        sessionId: 'session-7',
        iat: Date.now(),
        exp: Date.now() + 3600000,
      };

      redisService.getJson.mockResolvedValue(null);
      redisService.setJson.mockRejectedValue(new Error('Redis write failed'));

      const result = await service.checkAuthorization(
        schedulerUser,
        'referrals.transition.to_np_visit',
        mockReferral as Referral,
      );

      expect(result).toBe(true);
    });

    it('should return false for unknown role', async () => {
      const unknownRoleUser: AuthTokenPayload = {
        userId: 'user-8',
        email: 'unknown@example.com',
        roles: ['UNKNOWN_ROLE' as any],
        scopes: {
          sites: ['SITE_1'],
          states: ['CA'],
          legalEntities: ['ENTITY_1'],
        },
        sessionId: 'session-8',
        iat: Date.now(),
        exp: Date.now() + 3600000,
      };

      redisService.getJson.mockResolvedValue(null);
      redisService.setJson.mockResolvedValue(undefined);

      const result = await service.checkAuthorization(
        unknownRoleUser,
        'referrals.transition.to_clinical_review',
        mockReferral as Referral,
      );

      expect(result).toBe(false);
    });
  });

  describe('checkScope', () => {
    const mockUser: AuthTokenPayload = {
      userId: 'user-123',
      email: 'user@example.com',
      roles: [UserRole.CLINICAL_REVIEWER],
      scopes: {
        sites: ['site-1', 'site-2'],
        states: ['CA', 'NY'],
        legalEntities: ['entity-1'],
      },
      sessionId: 'session-123',
      iat: Date.now(),
      exp: Date.now() + 3600000,
    };

    const mockReferral: Partial<Referral> = {
      id: 'ref-123',
      site: 'site-1',
      state: 'CA',
      legalEntity: 'entity-1',
    } as Referral;

    it('should return true when user has matching site, state, and legal entity scopes', async () => {
      const result = await service.checkScope(mockUser, mockReferral as Referral);
      expect(result).toBe(true);
    });

    it('should return true when user is ADMIN regardless of scopes', async () => {
      const adminUser: AuthTokenPayload = {
        ...mockUser,
        roles: [UserRole.ADMIN],
        scopes: {
          sites: [],
          states: [],
          legalEntities: [],
        },
      };

      const result = await service.checkScope(adminUser, mockReferral as Referral);
      expect(result).toBe(true);
    });

    it('should return false when user lacks site scope', async () => {
      const referralWithDifferentSite = {
        ...mockReferral,
        site: 'site-3', // Not in user's site scopes
      } as Referral;

      const result = await service.checkScope(mockUser, referralWithDifferentSite);
      expect(result).toBe(false);
    });

    it('should return false when user lacks state scope', async () => {
      const referralWithDifferentState = {
        ...mockReferral,
        state: 'TX', // Not in user's state scopes
      } as Referral;

      const result = await service.checkScope(mockUser, referralWithDifferentState);
      expect(result).toBe(false);
    });

    it('should return false when user lacks legal entity scope', async () => {
      const referralWithDifferentEntity = {
        ...mockReferral,
        legalEntity: 'entity-2', // Not in user's legal entity scopes
      } as Referral;

      const result = await service.checkScope(mockUser, referralWithDifferentEntity);
      expect(result).toBe(false);
    });

    it('should return true when referral has null site and user has any site scopes', async () => {
      const referralWithoutSite = {
        ...mockReferral,
        site: null,
      } as Referral;

      const result = await service.checkScope(mockUser, referralWithoutSite);
      expect(result).toBe(true);
    });

    it('should return true when referral has null state and user has any state scopes', async () => {
      const referralWithoutState = {
        ...mockReferral,
        state: null,
      } as Referral;

      const result = await service.checkScope(mockUser, referralWithoutState);
      expect(result).toBe(true);
    });

    it('should return true when referral has null legal entity and user has any legal entity scopes', async () => {
      const referralWithoutEntity = {
        ...mockReferral,
        legalEntity: null,
      } as Referral;

      const result = await service.checkScope(mockUser, referralWithoutEntity);
      expect(result).toBe(true);
    });

    it('should return true when all referral location fields are null', async () => {
      const referralWithNoLocation = {
        id: 'ref-123',
        site: null,
        state: null,
        legalEntity: null,
      } as Referral;

      const result = await service.checkScope(mockUser, referralWithNoLocation);
      expect(result).toBe(true);
    });

    it('should return false when user fails multiple scope checks', async () => {
      const referralWithAllDifferent = {
        ...mockReferral,
        site: 'site-3',
        state: 'TX',
        legalEntity: 'entity-2',
      } as Referral;

      const result = await service.checkScope(mockUser, referralWithAllDifferent);
      expect(result).toBe(false);
    });

    it('should handle user with multiple roles including ADMIN', async () => {
      const multiRoleUser: AuthTokenPayload = {
        ...mockUser,
        roles: [UserRole.CLINICAL_REVIEWER, UserRole.ADMIN],
        scopes: {
          sites: [],
          states: [],
          legalEntities: [],
        },
      };

      const result = await service.checkScope(multiRoleUser, mockReferral as Referral);
      expect(result).toBe(true);
    });

    it('should handle referral with site in second position of user scopes', async () => {
      const referralWithSecondSite = {
        ...mockReferral,
        site: 'site-2', // Second site in user's scopes
      } as Referral;

      const result = await service.checkScope(mockUser, referralWithSecondSite);
      expect(result).toBe(true);
    });

    it('should handle referral with state in second position of user scopes', async () => {
      const referralWithSecondState = {
        ...mockReferral,
        state: 'NY', // Second state in user's scopes
      } as Referral;

      const result = await service.checkScope(mockUser, referralWithSecondState);
      expect(result).toBe(true);
    });
  });

  describe('checkTerminalState', () => {
    it('should return valid=true for ACTIVE case outcome', () => {
      const referral = {
        ...mockReferral,
        caseOutcome: 'ACTIVE',
      } as Referral;

      const result = service.checkTerminalState(referral);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return valid=false for all terminal case outcomes', () => {
      const terminalOutcomes = [
        'REJECTED',
        'PATIENT_DECLINED',
        'DUPLICATE',
        'DISCHARGED',
        'CLOSED',
      ];

      for (const outcome of terminalOutcomes) {
        const referral = {
          ...mockReferral,
          caseOutcome: outcome,
        } as Referral;

        const result = service.checkTerminalState(referral);
        expect(result.valid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].type).toBe('transition');
        expect(result.errors[0].field).toBe('caseOutcome');
      }
    });
  });
});
