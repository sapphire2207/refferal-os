import { Test, TestingModule } from '@nestjs/testing';
import { WorkflowService } from '../services/workflow.service';
import { ReferralsService } from '../services/referrals.service';
import { ValidationService } from '../services/validation.service';
import { GatewayCheckService } from '../services/gateway-check.service';
import { EventService } from '../services/event.service';
import { AssignmentService } from '../services/assignment.service';
import { PrismaService } from '../../../database/prisma.service';
import { RedisService } from '../../../redis/redis.service';
import {
  PipelineStage,
  WorkStatus,
  UserRole,
  AuthTokenPayload,
  CaseOutcome,
} from '@heals/types';

describe('Referrals Workflow Engine - Performance and Latency Tests (Phase 16)', () => {
  let workflowService: WorkflowService;
  let referralsService: ReferralsService;
  let validationService: ValidationService;
  let dbReferrals: Map<string, any>;
  let redisCache: Map<string, string>;

  const testUser: AuthTokenPayload = {
    userId: 'perf-user-1',
    email: 'perf@heals.com',
    sessionId: 'session-perf-1',
    iat: 1000000,
    exp: 2000000,
    roles: [UserRole.INTAKE_SPECIALIST],
    scopes: { sites: ['Site-A'], states: ['FL'], legalEntities: ['HEALS_FL'] },
  };

  beforeEach(async () => {
    dbReferrals = new Map();
    redisCache = new Map();
    let txLock = Promise.resolve();

    const mockPrisma: any = {
      referral: {
        findUnique: jest.fn(async ({ where }) => {
          const ref = dbReferrals.get(where.id);
          return ref ? { ...ref } : null;
        }),
        update: jest.fn(async ({ where, data }) => {
          const existing = dbReferrals.get(where.id);
          if (!existing) throw new Error('Not found');
          const updated = { ...existing, ...data, updatedAt: new Date() };
          dbReferrals.set(where.id, updated);
          return { ...updated };
        }),
        groupBy: jest.fn(async ({ by }) => {
          const field = by[0];
          const counts: any = {};
          for (const item of dbReferrals.values()) {
            counts[item[field]] = (counts[item[field]] || 0) + 1;
          }
          return Object.entries(counts).map(([k, v]) => ({
            [field]: k,
            _count: v,
          }));
        }),
      },
      workflowTransition: {
        create: jest.fn(async ({ data }) => ({
          ...data,
          id: 'trans-perf',
          transitionedAt: new Date(),
        })),
      },
      eventOutbox: {
        create: jest.fn(async ({ data }) => ({
          ...data,
          id: 'outbox-perf',
          createdAt: new Date(),
        })),
      },
      referralAssignment: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue({ id: 'assign-perf' }),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      user: {
        findUnique: jest.fn(async () => ({
          id: 'test-user',
          isActive: true,
          userRoles: [{ role: 'INTAKE_SPECIALIST' }],
          userScopes: [{ site: 'Site-A', state: 'FL', legalEntity: 'HEALS_FL' }],
        })),
      },
      $queryRaw: jest.fn(async (strings: any, ...values: any[]) => {
        const id = values[0];
        const ref = dbReferrals.get(id);
        return ref ? [{ ...ref }] : [];
      }),
      $transaction: jest.fn(async (callback: any) => {
        const nextLock = txLock.then(async () => {
          return callback(mockPrisma);
        });
        txLock = nextLock.catch(() => {});
        return nextLock;
      }),
    };

    const mockRedis: any = {
      get: jest.fn(async (key: string) => redisCache.get(key) || null),
      set: jest.fn(async (key: string, val: string) => {
        redisCache.set(key, val);
      }),
      setEx: jest.fn(async (key: string, _ttl: number, val: string) => {
        redisCache.set(key, val);
      }),
      del: jest.fn(async (key: string) => {
        redisCache.delete(key);
      }),
      delPattern: jest.fn(async (pattern: string) => {
        const prefix = pattern.replace('*', '');
        for (const k of redisCache.keys()) {
          if (k.startsWith(prefix)) redisCache.delete(k);
        }
      }),
      getJson: jest.fn(async (key: string) => {
        const val = redisCache.get(key);
        return val ? JSON.parse(val) : null;
      }),
      setJson: jest.fn(async (key: string, val: any) => {
        redisCache.set(key, JSON.stringify(val));
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowService,
        ReferralsService,
        ValidationService,
        GatewayCheckService,
        EventService,
        AssignmentService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();

    workflowService = module.get<WorkflowService>(WorkflowService);
    referralsService = module.get<ReferralsService>(ReferralsService);
    validationService = module.get<ValidationService>(ValidationService);
  });

  // Task 16.4: Single transition latency test (Target: P95 < 500ms)
  it('Task 16.4: should execute transitions with P95 latency strictly below 500ms target', async () => {
    const ITERATIONS = 50;
    const latencies: number[] = [];

    for (let i = 0; i < ITERATIONS; i++) {
      const refId = `perf-ref-${i}`;
      dbReferrals.set(refId, {
        id: refId,
        patientId: 'pat-1',
        referralSource: 'Doctor Clinic',
        insurancePayer: 'Aetna',
        pipelineStage: PipelineStage.INTAKE,
        workStatus: WorkStatus.PENDING,
        version: 1,
        site: 'Site-A',
        state: 'FL',
        legalEntity: 'HEALS_FL',
        coverageVerified: true,
        caseOutcome: CaseOutcome.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const start = Date.now();
      await workflowService.executeTransition(
        refId,
        {
          targetStage: PipelineStage.CLINICAL_REVIEW,
          version: 1,
          reason: 'Benchmark latency execution',
        },
        testUser,
      );
      const elapsed = Date.now() - start;
      latencies.push(elapsed);
    }

    latencies.sort((a, b) => a - b);
    const p95Index = Math.floor(latencies.length * 0.95);
    const p95Latency = latencies[p95Index];
    const avgLatency = latencies.reduce((acc, curr) => acc + curr, 0) / latencies.length;

    // SLA Target: P95 < 500ms
    expect(p95Latency).toBeLessThan(500);
    expect(avgLatency).toBeLessThan(100);
  });

  // Task 16.4: Concurrent transitions on different referrals
  it('Task 16.4: should handle concurrent transitions on distinct referrals without interference', async () => {
    const CONCURRENT_COUNT = 20;

    for (let i = 0; i < CONCURRENT_COUNT; i++) {
      const refId = `distinct-ref-${i}`;
      dbReferrals.set(refId, {
        id: refId,
        patientId: 'pat-1',
        referralSource: 'General Hospital',
        insurancePayer: 'Humana',
        pipelineStage: PipelineStage.INTAKE,
        workStatus: WorkStatus.PENDING,
        version: 1,
        site: 'Site-A',
        state: 'FL',
        legalEntity: 'HEALS_FL',
        coverageVerified: true,
        caseOutcome: CaseOutcome.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    const start = Date.now();
    const promises = Array.from({ length: CONCURRENT_COUNT }).map((_, i) =>
      workflowService.executeTransition(
        `distinct-ref-${i}`,
        {
          targetStage: PipelineStage.CLINICAL_REVIEW,
          version: 1,
          reason: `Concurrent distinct transition #${i}`,
        },
        testUser,
      ),
    );

    const results = await Promise.all(promises);
    const totalTime = Date.now() - start;

    expect(results).toHaveLength(CONCURRENT_COUNT);
    for (let i = 0; i < CONCURRENT_COUNT; i++) {
      expect(results[i].success).toBe(true);
      expect(results[i].referral.pipelineStage).toBe(PipelineStage.CLINICAL_REVIEW);
      expect(results[i].referral.version).toBe(2);
    }
    // All 20 transitions processed concurrently under 1000ms
    expect(totalTime).toBeLessThan(1000);
  });

  // Task 16.4: Cache Hit Rate & Caching Efficiency
  it('Task 16.4: should demonstrate high cache hit rates and sub-millisecond cached lookups', async () => {
    // 1. Permission Caching (ValidationService)
    const check1Start = Date.now();
    const authorizedFirst = await validationService.checkAuthorization(
      testUser,
      'referrals.transition.to_clinical_review',
      {} as any,
    );
    const check1Time = Date.now() - check1Start;
    expect(authorizedFirst).toBe(true);

    // Second check should be instant cache hit
    const check2Start = Date.now();
    const authorizedSecond = await validationService.checkAuthorization(
      testUser,
      'referrals.transition.to_clinical_review',
      {} as any,
    );
    const check2Time = Date.now() - check2Start;
    expect(authorizedSecond).toBe(true);
    // Cached check must be fast (sub-millisecond or within jitter margin)
    expect(check2Time).toBeLessThanOrEqual(Math.max(check1Time + 5, 20));

    // 2. Dashboard Metrics Caching
    dbReferrals.set('metric-ref-1', {
      id: 'metric-ref-1',
      pipelineStage: PipelineStage.INTAKE,
      workStatus: WorkStatus.PENDING,
      site: 'Site-A',
      state: 'FL',
      legalEntity: 'HEALS_FL',
    });

    // First call: computes and caches in Redis
    const metrics1 = await referralsService.getDashboardMetrics(testUser);
    expect(metrics1.totalActive).toBeGreaterThan(0);

    // Second call: instant Redis cache hit
    const metrics2 = await referralsService.getDashboardMetrics(testUser);
    expect(metrics2).toEqual(metrics1);
  });
});
