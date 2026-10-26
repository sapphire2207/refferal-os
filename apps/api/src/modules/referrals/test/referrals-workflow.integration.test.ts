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
  BillingStatus,
} from '@heals/types';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import {
  WorkflowValidationException,
  VersionConflictException,
} from '../exceptions/workflow.exceptions';

describe('Referrals Workflow Engine - Integration Tests (Phase 12)', () => {
  let workflowService: WorkflowService;
  let referralsService: ReferralsService;
  let validationService: ValidationService;
  let gatewayCheckService: GatewayCheckService;
  let eventService: EventService;
  let assignmentService: AssignmentService;
  let prismaService: PrismaService;
  let redisService: RedisService;

  // In-memory simulated database state for integration testing
  let dbReferrals: Map<string, any>;
  let dbPatients: Map<string, any>;
  let dbTransitions: any[];
  let dbOutbox: any[];
  let dbAssignments: any[];
  let dbClinicalReviews: any[];
  let dbAppointments: any[];
  let dbEncounters: any[];
  let dbClinicalNotes: any[];
  let dbNoteReviews: any[];
  let dbUsers: Map<string, any>;
  let redisCache: Map<string, string>;

  // Users
  const intakeUser: AuthTokenPayload = {
    userId: 'user-intake-1',
    email: 'intake@heals.com',
    sessionId: 'session-1',
    iat: 1000000,
    exp: 2000000,
    roles: [UserRole.INTAKE_SPECIALIST],
    scopes: { sites: ['Site-A'], states: ['FL'], legalEntities: ['HEALS_FL'] },
  };

  const reviewerUser: AuthTokenPayload = {
    userId: 'user-reviewer-1',
    email: 'reviewer@heals.com',
    sessionId: 'session-2',
    iat: 1000000,
    exp: 2000000,
    roles: [UserRole.CLINICAL_REVIEWER],
    scopes: { sites: ['Site-A'], states: ['FL'], legalEntities: ['HEALS_FL'] },
  };

  const schedulerUser: AuthTokenPayload = {
    userId: 'user-scheduler-1',
    email: 'scheduler@heals.com',
    sessionId: 'session-3',
    iat: 1000000,
    exp: 2000000,
    roles: [UserRole.SCHEDULER],
    scopes: { sites: ['Site-A'], states: ['FL'], legalEntities: ['HEALS_FL'] },
  };

  const outOfScopeUser: AuthTokenPayload = {
    userId: 'user-ga-1',
    email: 'georgia@heals.com',
    sessionId: 'session-4',
    iat: 1000000,
    exp: 2000000,
    roles: [UserRole.INTAKE_SPECIALIST],
    scopes: { sites: ['Site-GA'], states: ['GA'], legalEntities: ['HEALS_GA'] },
  };

  beforeEach(async () => {
    dbReferrals = new Map();
    dbPatients = new Map();
    dbTransitions = [];
    dbOutbox = [];
    dbAssignments = [];
    dbClinicalReviews = [];
    dbAppointments = [];
    dbEncounters = [];
    dbClinicalNotes = [];
    dbNoteReviews = [];
    dbUsers = new Map();
    redisCache = new Map();

    // Populate patient
    dbPatients.set('patient-1', {
      id: 'patient-1',
      firstName: 'John',
      lastName: 'Doe',
      dateOfBirth: new Date('1980-01-01'),
    });

    // Populate user in DB
    dbUsers.set('user-reviewer-1', {
      id: 'user-reviewer-1',
      isActive: true,
      userRoles: [{ role: 'CLINICAL_REVIEWER' }],
      userScopes: [{ site: 'Site-A', state: 'FL', legalEntity: 'HEALS_FL' }],
    });

    const mockPrisma: any = {
      patient: {
        findUnique: jest.fn(async ({ where }) => dbPatients.get(where.id) || null),
      },
      user: {
        findUnique: jest.fn(async ({ where }) => dbUsers.get(where.id) || null),
      },
      referral: {
        create: jest.fn(async ({ data }) => {
          const id = data.id || 'ref-' + (dbReferrals.size + 1);
          const entity = { ...data, id, version: 1, createdAt: new Date(), updatedAt: new Date() };
          dbReferrals.set(id, entity);
          return entity;
        }),
        findUnique: jest.fn(async ({ where }) => dbReferrals.get(where.id) || null),
        findMany: jest.fn(async () => Array.from(dbReferrals.values())),
        count: jest.fn(async () => dbReferrals.size),
        update: jest.fn(async ({ where, data }) => {
          const existing = dbReferrals.get(where.id);
          if (!existing) throw new NotFoundException();
          const updated = { ...existing, ...data, updatedAt: new Date() };
          dbReferrals.set(where.id, updated);
          return updated;
        }),
      },
      referralAssignment: {
        create: jest.fn(async ({ data }) => {
          const record = { ...data, id: 'assign-' + (dbAssignments.length + 1) };
          dbAssignments.push(record);
          return record;
        }),
        updateMany: jest.fn(async ({ where, data }) => {
          let count = 0;
          for (const a of dbAssignments) {
            if (a.referralId === where.referralId && a.unassignedAt === null) {
              Object.assign(a, data);
              count++;
            }
          }
          return { count };
        }),
      },
      workflowTransition: {
        create: jest.fn(async ({ data }) => {
          const record = { ...data, id: 'trans-' + (dbTransitions.length + 1) };
          dbTransitions.push(record);
          return record;
        }),
        findMany: jest.fn(async ({ where, take, skip }) => {
          let res = dbTransitions.filter((t) => t.referralId === where.referralId);
          if (skip) res = res.slice(skip);
          if (take) res = res.slice(0, take);
          return res;
        }),
      },
      eventOutbox: {
        create: jest.fn(async ({ data }) => {
          const record = { ...data, id: 'outbox-' + (dbOutbox.length + 1) };
          dbOutbox.push(record);
          return record;
        }),
      },
      clinicalReview: {
        findFirst: jest.fn(async ({ where }) => {
          return dbClinicalReviews.find((r) => r.referralId === where.referralId && r.decision === where.decision) || null;
        }),
        create: jest.fn(async ({ data }) => {
          const record = { ...data, id: 'cr-' + (dbClinicalReviews.length + 1) };
          dbClinicalReviews.push(record);
          return record;
        }),
      },
      appointment: {
        findFirst: jest.fn(async ({ where }) => {
          return dbAppointments.find((a) => a.referralId === where.referralId) || null;
        }),
      },
      encounter: {
        findFirst: jest.fn(async ({ where }) => {
          return dbEncounters.find((e) => e.referralId === where.referralId) || null;
        }),
      },
      clinicalNote: {
        findFirst: jest.fn(async ({ where }) => {
          return dbClinicalNotes.find((n) => n.referralId === where.referralId) || null;
        }),
      },
      noteReview: {
        findFirst: jest.fn(async ({ where }) => {
          return dbNoteReviews.find((nr) => nr.clinicalNote?.referralId === where.clinicalNote?.referralId) || null;
        }),
      },
      idempotencyKey: {
        findUnique: jest.fn(async () => null),
        upsert: jest.fn(async () => ({})),
      },
      $transaction: jest.fn(async (cb) => cb(mockPrisma)),
      $queryRaw: jest.fn(async () => []),
    };

    const mockRedis = {
      get: jest.fn(async (key: string) => redisCache.get(key) || null),
      set: jest.fn(async (key: string, val: string) => redisCache.set(key, val)),
      getJson: jest.fn(async (key: string) => {
        const val = redisCache.get(key);
        return val ? JSON.parse(val) : null;
      }),
      setJson: jest.fn(async (key: string, val: any) => {
        redisCache.set(key, JSON.stringify(val));
      }),
      del: jest.fn(async (key: string) => {
        redisCache.delete(key);
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
    gatewayCheckService = module.get<GatewayCheckService>(GatewayCheckService);
    eventService = module.get<EventService>(EventService);
    assignmentService = module.get<AssignmentService>(AssignmentService);
    prismaService = module.get<PrismaService>(PrismaService);
    redisService = module.get<RedisService>(RedisService);
  });

  // ============================================================================
  // Task 12.2: INTAKE → CLINICAL_REVIEW transition
  // ============================================================================
  it('12.2: should complete INTAKE → CLINICAL_REVIEW forward transition with gate validation and audit trail', async () => {
    // 1. Create referral with all required intake fields
    const referral = await referralsService.create(
      {
        patientId: 'patient-1',
        site: 'Site-A',
        state: 'FL',
        legalEntity: 'HEALS_FL',
        referralSource: 'Community Clinic',
        insurancePayer: 'Florida Blue',
        coverageVerified: true,
      },
      intakeUser,
    );

    expect(referral.pipelineStage).toBe(PipelineStage.INTAKE);
    expect(referral.version).toBe(1);

    // 2. Execute transition to CLINICAL_REVIEW
    const transitionResult = await workflowService.executeTransition(
      referral.id,
      {
        targetStage: PipelineStage.CLINICAL_REVIEW,
        version: 1,
        reason: 'Intake and verification completed',
      },
      intakeUser,
    );

    // Verify stage, version, and work status
    expect(transitionResult.success).toBe(true);
    expect(transitionResult.referral.pipelineStage).toBe(PipelineStage.CLINICAL_REVIEW);
    expect(transitionResult.referral.workStatus).toBe(WorkStatus.PENDING);
    expect(transitionResult.referral.version).toBe(2);

    // Verify WorkflowTransition audit record
    expect(dbTransitions).toHaveLength(1);
    expect(dbTransitions[0].fromStage).toBe(PipelineStage.INTAKE);
    expect(dbTransitions[0].toStage).toBe(PipelineStage.CLINICAL_REVIEW);
    expect(dbTransitions[0].transitionedBy).toBe(intakeUser.userId);

    // Verify assignment to CLINICAL_REVIEWER role queue
    expect(transitionResult.referral.assignedRole).toBe(UserRole.CLINICAL_REVIEWER);

    // Verify event in EventOutbox
    expect(dbOutbox.some((e) => e.eventType === 'referral.stage.changed')).toBe(true);
  });

  // ============================================================================
  // Task 12.3: Clinical review accept flow
  // ============================================================================
  it('12.3: should transition from CLINICAL_REVIEW to SCHEDULING when clinical review is ACCEPT', async () => {
    // Seed referral in CLINICAL_REVIEW stage
    const referralId = 'ref-cr-accept';
    dbReferrals.set(referralId, {
      id: referralId,
      patientId: 'patient-1',
      pipelineStage: PipelineStage.CLINICAL_REVIEW,
      workStatus: WorkStatus.PENDING,
      version: 2,
      site: 'Site-A',
      state: 'FL',
      legalEntity: 'HEALS_FL',
      referralSource: 'Clinic',
      insurancePayer: 'Aetna',
      coverageVerified: true,
    });

    // Seed ClinicalReview record with ACCEPT
    dbClinicalReviews.push({
      id: 'cr-1',
      referralId,
      decision: 'ACCEPT',
      reviewerId: reviewerUser.userId,
      createdAt: new Date(),
    });

    const result = await workflowService.executeTransition(
      referralId,
      {
        targetStage: PipelineStage.SCHEDULING,
        version: 2,
        reason: 'Patient clinically accepted for home visit',
      },
      reviewerUser,
    );

    expect(result.success).toBe(true);
    expect(result.referral.pipelineStage).toBe(PipelineStage.SCHEDULING);
    expect(result.referral.version).toBe(3);
    expect(result.referral.assignedRole).toBe(UserRole.SCHEDULER);
  });

  // ============================================================================
  // Task 12.4: Clinical review return flow (Backward transition)
  // ============================================================================
  it('12.4: should transition backward from CLINICAL_REVIEW to INTAKE when reason is provided', async () => {
    const referralId = 'ref-cr-return';
    dbReferrals.set(referralId, {
      id: referralId,
      patientId: 'patient-1',
      pipelineStage: PipelineStage.CLINICAL_REVIEW,
      workStatus: WorkStatus.PENDING,
      version: 2,
      site: 'Site-A',
      state: 'FL',
      legalEntity: 'HEALS_FL',
    });

    const result = await workflowService.executeTransition(
      referralId,
      {
        targetStage: PipelineStage.INTAKE,
        version: 2,
        reason: 'Missing primary physician progress notes for verification',
      },
      reviewerUser,
    );

    expect(result.success).toBe(true);
    expect(result.referral.pipelineStage).toBe(PipelineStage.INTAKE);
    expect(result.referral.version).toBe(3);
    expect(dbTransitions[0].reason).toContain('Missing primary physician');
  });

  // ============================================================================
  // Task 12.5: Clinical review reject flow
  // ============================================================================
  it('12.5: should block forward transition when case outcome is set to REJECTED', async () => {
    const referralId = 'ref-rejected';
    dbReferrals.set(referralId, {
      id: referralId,
      patientId: 'patient-1',
      pipelineStage: PipelineStage.CLINICAL_REVIEW,
      workStatus: WorkStatus.PENDING,
      caseOutcome: CaseOutcome.REJECTED,
      version: 2,
      site: 'Site-A',
      state: 'FL',
      legalEntity: 'HEALS_FL',
    });

    // Update referral with REJECTED caseOutcome
    const updated = await referralsService.update(
      referralId,
      { version: 2, coverageNotes: 'Patient outside service radius' },
      reviewerUser,
    );
    expect(updated.version).toBe(3);

    // Forward transition should fail gate check
    await expect(
      workflowService.executeTransition(
        referralId,
        {
          targetStage: PipelineStage.SCHEDULING,
          version: 3,
        },
        reviewerUser,
      ),
    ).rejects.toThrow();
  });

  // ============================================================================
  // Task 12.6: Version conflict handling (HTTP 409)
  // ============================================================================
  it('12.6: should reject concurrent update with VersionConflictException when version is stale', async () => {
    const referralId = 'ref-conflict';
    dbReferrals.set(referralId, {
      id: referralId,
      patientId: 'patient-1',
      pipelineStage: PipelineStage.INTAKE,
      workStatus: WorkStatus.PENDING,
      version: 5,
      site: 'Site-A',
      state: 'FL',
      legalEntity: 'HEALS_FL',
      referralSource: 'Clinic',
      insurancePayer: 'BlueCross',
      coverageVerified: true,
    });

    // Client B attempts transition with stale version 4
    await expect(
      workflowService.executeTransition(
        referralId,
        {
          targetStage: PipelineStage.CLINICAL_REVIEW,
          version: 4, // Stale!
          reason: 'Attempt transition with old version',
        },
        intakeUser,
      ),
    ).rejects.toThrow(VersionConflictException);

    // Referral remains untouched at version 5
    expect(dbReferrals.get(referralId).version).toBe(5);
  });

  // ============================================================================
  // Task 12.7: Authorization failures (403 Forbidden)
  // ============================================================================
  it('12.7: should reject transition when user lacks required action permission', async () => {
    const referralId = 'ref-auth-fail';
    dbReferrals.set(referralId, {
      id: referralId,
      patientId: 'patient-1',
      pipelineStage: PipelineStage.INTAKE,
      workStatus: WorkStatus.PENDING,
      version: 1,
      site: 'Site-A',
      state: 'FL',
      legalEntity: 'HEALS_FL',
      referralSource: 'Clinic',
      insurancePayer: 'BlueCross',
      coverageVerified: true,
    });

    // Scheduler lacks permission to transition from INTAKE to CLINICAL_REVIEW
    await expect(
      workflowService.executeTransition(
        referralId,
        {
          targetStage: PipelineStage.CLINICAL_REVIEW,
          version: 1,
        },
        schedulerUser,
      ),
    ).rejects.toThrow(WorkflowValidationException);
  });

  // ============================================================================
  // Task 12.8: Scope access denial
  // ============================================================================
  it('12.8: should reject access when user has scope for Site-GA only and referral is Site-A', async () => {
    const referralId = 'ref-scope-fail';
    dbReferrals.set(referralId, {
      id: referralId,
      patientId: 'patient-1',
      pipelineStage: PipelineStage.INTAKE,
      workStatus: WorkStatus.PENDING,
      version: 1,
      site: 'Site-A', // Florida site
      state: 'FL',
      legalEntity: 'HEALS_FL',
    });

    await expect(
      workflowService.executeTransition(
        referralId,
        {
          targetStage: PipelineStage.CLINICAL_REVIEW,
          version: 1,
        },
        outOfScopeUser, // Georgia scope only
      ),
    ).rejects.toThrow(WorkflowValidationException);
  });

  // ============================================================================
  // Task 12.9: Gate validation failures
  // ============================================================================
  it('12.9: should block INTAKE → CLINICAL_REVIEW when coverageVerified is false', async () => {
    const referralId = 'ref-gate-fail';
    dbReferrals.set(referralId, {
      id: referralId,
      patientId: 'patient-1',
      pipelineStage: PipelineStage.INTAKE,
      workStatus: WorkStatus.PENDING,
      version: 1,
      site: 'Site-A',
      state: 'FL',
      legalEntity: 'HEALS_FL',
      referralSource: 'Clinic',
      insurancePayer: 'Humana',
      coverageVerified: false, // Incomplete gate!
    });

    await expect(
      workflowService.executeTransition(
        referralId,
        {
          targetStage: PipelineStage.CLINICAL_REVIEW,
          version: 1,
        },
        intakeUser,
      ),
    ).rejects.toThrow(WorkflowValidationException);
  });

  // ============================================================================
  // Task 12.10: Work status transitions
  // ============================================================================
  it('12.10: should progress work status PENDING → IN_PROGRESS → BLOCKED_NEEDS_INFO with reason', async () => {
    const referralId = 'ref-work-status';
    dbReferrals.set(referralId, {
      id: referralId,
      patientId: 'patient-1',
      pipelineStage: PipelineStage.INTAKE,
      workStatus: WorkStatus.PENDING,
      version: 1,
      site: 'Site-A',
      state: 'FL',
      legalEntity: 'HEALS_FL',
    });

    // 1. PENDING -> IN_PROGRESS
    const s1 = await workflowService.updateWorkStatus(
      referralId,
      { workStatus: WorkStatus.IN_PROGRESS, version: 1 },
      intakeUser,
    );
    expect(s1.workStatus).toBe(WorkStatus.IN_PROGRESS);
    expect(s1.version).toBe(2);

    // 2. IN_PROGRESS -> BLOCKED_NEEDS_INFO
    const s2 = await workflowService.updateWorkStatus(
      referralId,
      {
        workStatus: WorkStatus.BLOCKED_NEEDS_INFO,
        version: 2,
        reason: 'Waiting for patient ID card upload',
      },
      intakeUser,
    );
    expect(s2.workStatus).toBe(WorkStatus.BLOCKED_NEEDS_INFO);
    expect(s2.version).toBe(3);
  });

  // ============================================================================
  // Task 12.11: Assignment operations
  // ============================================================================
  it('12.11: should assign to user and reassign to role queue with audit trail', async () => {
    const referralId = 'ref-assignment';
    dbReferrals.set(referralId, {
      id: referralId,
      patientId: 'patient-1',
      pipelineStage: PipelineStage.CLINICAL_REVIEW,
      workStatus: WorkStatus.PENDING,
      version: 1,
      site: 'Site-A',
      state: 'FL',
      legalEntity: 'HEALS_FL',
    });

    // 1. Assign to specific user
    const a1 = await workflowService.assignReferral(
      referralId,
      {
        userId: 'user-reviewer-1',
        reason: 'Designated lead clinical reviewer',
      },
      intakeUser,
    );
    expect(a1.assignedTo).toBe('user-reviewer-1');
    expect(dbAssignments).toHaveLength(1);

    // 2. Reassign to role queue
    const a2 = await workflowService.assignReferral(
      referralId,
      {
        role: UserRole.CLINICAL_REVIEWER,
        reason: 'Reviewer on leave, return to role pool',
      },
      intakeUser,
    );
    expect(a2.assignedTo).toBeNull();
    expect(a2.assignedRole).toBe(UserRole.CLINICAL_REVIEWER);
  });

  // ============================================================================
  // Task 12.12: Workflow history query
  // ============================================================================
  it('12.12: should return chronological workflow history with pagination support', async () => {
    const referralId = 'ref-hist';
    dbReferrals.set(referralId, {
      id: referralId,
      patientId: 'patient-1',
      pipelineStage: PipelineStage.INTAKE,
      workStatus: WorkStatus.PENDING,
      version: 1,
      site: 'Site-A',
      state: 'FL',
      legalEntity: 'HEALS_FL',
    });

    dbTransitions.push(
      { id: 't1', referralId, fromStage: null, toStage: PipelineStage.INTAKE, transitionedAt: new Date('2026-01-01') },
      { id: 't2', referralId, fromStage: PipelineStage.INTAKE, toStage: PipelineStage.CLINICAL_REVIEW, transitionedAt: new Date('2026-01-02') },
      { id: 't3', referralId, fromStage: PipelineStage.CLINICAL_REVIEW, toStage: PipelineStage.SCHEDULING, transitionedAt: new Date('2026-01-03') },
    );

    const history = await workflowService.getWorkflowHistory(referralId, intakeUser, { limit: 2, offset: 1 });

    expect(history).toHaveLength(2);
    expect(history[0].id).toBe('t2');
    expect(history[1].id).toBe('t3');
  });
});
