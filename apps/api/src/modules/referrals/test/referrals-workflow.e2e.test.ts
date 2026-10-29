import { Test, TestingModule } from '@nestjs/testing';
import { WorkflowService } from '../services/workflow.service';
import { ReferralsService } from '../services/referrals.service';
import { ValidationService } from '../services/validation.service';
import { GatewayCheckService } from '../services/gateway-check.service';
import { EventService } from '../services/event.service';
import { AssignmentService } from '../services/assignment.service';
import { PrismaService } from '../../../database/prisma.service';
import { RedisService } from '../../../redis/redis.service';
import { AuditService } from '../../audit/audit.service';
import {
  PipelineStage,
  WorkStatus,
  UserRole,
  AuthTokenPayload,
  CaseOutcome,
  BillingStatus,
  ClinicalReviewDecision,
} from '@heals/types';
import { ConflictException } from '@nestjs/common';
import {
  WorkflowValidationException,
  VersionConflictException,
} from '../exceptions/workflow.exceptions';

describe('Referrals Workflow Engine - End-to-End Tests (Phase 14 & Phase 15.3)', () => {
  let workflowService: WorkflowService;
  let referralsService: ReferralsService;
  let validationService: ValidationService;
  let gatewayCheckService: GatewayCheckService;
  let eventService: EventService;
  let assignmentService: AssignmentService;
  let prismaService: PrismaService;
  let redisService: RedisService;

  // In-memory data store for E2E tests
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
  let dbIdempotencyKeys: Map<string, any>;
  let dbUsers: Map<string, any>;
  let redisCache: Map<string, string>;

  // User payloads for each persona in the workflow
  const intakeUser: AuthTokenPayload = {
    userId: 'user-intake-1',
    email: 'intake@heals.com',
    sessionId: 'session-intake-1',
    iat: 1000000,
    exp: 2000000,
    roles: [UserRole.INTAKE_SPECIALIST],
    scopes: { sites: ['Site-A'], states: ['FL'], legalEntities: ['HEALS_FL'] },
  };

  const reviewerUser: AuthTokenPayload = {
    userId: 'user-reviewer-1',
    email: 'reviewer@heals.com',
    sessionId: 'session-reviewer-1',
    iat: 1000000,
    exp: 2000000,
    roles: [UserRole.CLINICAL_REVIEWER],
    scopes: { sites: ['Site-A'], states: ['FL'], legalEntities: ['HEALS_FL'] },
  };

  const schedulerUser: AuthTokenPayload = {
    userId: 'user-scheduler-1',
    email: 'scheduler@heals.com',
    sessionId: 'session-scheduler-1',
    iat: 1000000,
    exp: 2000000,
    roles: [UserRole.SCHEDULER],
    scopes: { sites: ['Site-A'], states: ['FL'], legalEntities: ['HEALS_FL'] },
  };

  const npUser: AuthTokenPayload = {
    userId: 'user-np-1',
    email: 'np@heals.com',
    sessionId: 'session-np-1',
    iat: 1000000,
    exp: 2000000,
    roles: [UserRole.NURSE_PRACTITIONER],
    scopes: { sites: ['Site-A'], states: ['FL'], legalEntities: ['HEALS_FL'] },
  };

  const billingUser: AuthTokenPayload = {
    userId: 'user-billing-1',
    email: 'billing@heals.com',
    sessionId: 'session-billing-1',
    iat: 1000000,
    exp: 2000000,
    roles: [UserRole.BILLING_COORDINATOR],
    scopes: { sites: ['Site-A'], states: ['FL'], legalEntities: ['HEALS_FL'] },
  };

  const adminUser: AuthTokenPayload = {
    userId: 'user-admin-1',
    email: 'admin@heals.com',
    sessionId: 'session-admin-1',
    iat: 1000000,
    exp: 2000000,
    roles: [UserRole.ADMIN],
    scopes: { sites: [], states: [], legalEntities: [] },
  };

  const createTestReferral = (
    id: string,
    stage: PipelineStage,
    version: number,
    overrides: any = {},
  ) => {
    const ref = {
      id,
      patientId: 'pat-100',
      referralSource: 'Tampa General Hospital',
      insurancePayer: 'Blue Cross Blue Shield',
      pipelineStage: stage,
      workStatus: WorkStatus.PENDING,
      version,
      site: 'Site-A',
      state: 'FL',
      legalEntity: 'HEALS_FL',
      coverageVerified: true,
      caseOutcome: CaseOutcome.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
    dbReferrals.set(id, ref);
    return ref;
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
    dbIdempotencyKeys = new Map();
    dbUsers = new Map();
    redisCache = new Map();
    let txLock = Promise.resolve();

    // Seed baseline test patient
    dbPatients.set('pat-100', {
      id: 'pat-100',
      firstName: 'Eleanor',
      lastName: 'Vance',
      dateOfBirth: new Date('1952-08-14'),
    });

    // Seed users in mock database with names and scopes
    dbUsers.set(intakeUser.userId, {
      id: intakeUser.userId,
      firstName: 'Ian',
      lastName: 'Intake',
      isActive: true,
      userRoles: [{ role: UserRole.INTAKE_SPECIALIST }],
      userScopes: [{ site: 'Site-A', state: 'FL', legalEntity: 'HEALS_FL' }],
    });
    dbUsers.set(reviewerUser.userId, {
      id: reviewerUser.userId,
      firstName: 'Clara',
      lastName: 'Clinical',
      isActive: true,
      userRoles: [{ role: UserRole.CLINICAL_REVIEWER }],
      userScopes: [{ site: 'Site-A', state: 'FL', legalEntity: 'HEALS_FL' }],
    });
    dbUsers.set(schedulerUser.userId, {
      id: schedulerUser.userId,
      firstName: 'Sam',
      lastName: 'Scheduler',
      isActive: true,
      userRoles: [{ role: UserRole.SCHEDULER }],
      userScopes: [{ site: 'Site-A', state: 'FL', legalEntity: 'HEALS_FL' }],
    });
    dbUsers.set(npUser.userId, {
      id: npUser.userId,
      firstName: 'Nancy',
      lastName: 'Practitioner',
      isActive: true,
      userRoles: [{ role: UserRole.NURSE_PRACTITIONER }],
      userScopes: [{ site: 'Site-A', state: 'FL', legalEntity: 'HEALS_FL' }],
    });
    dbUsers.set(billingUser.userId, {
      id: billingUser.userId,
      firstName: 'Bob',
      lastName: 'Billing',
      isActive: true,
      userRoles: [{ role: UserRole.BILLING_COORDINATOR }],
      userScopes: [{ site: 'Site-A', state: 'FL', legalEntity: 'HEALS_FL' }],
    });

    const mockPrisma: any = {
      patient: {
        findUnique: jest.fn(async ({ where }) => dbPatients.get(where.id) || null),
      },
      user: {
        findUnique: jest.fn(async ({ where }) => {
          const u = dbUsers.get(where.id);
          return u ? { firstName: 'Test', lastName: 'User', ...u } : null;
        }),
      },
      referral: {
        create: jest.fn(async ({ data }) => {
          const id = data.id || 'ref-' + (dbReferrals.size + 1);
          const entity = {
            ...data,
            id,
            version: 1,
            caseOutcome: CaseOutcome.ACTIVE,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          dbReferrals.set(id, entity);
          return { ...entity };
        }),
        findUnique: jest.fn(async ({ where }) => {
          const ref = dbReferrals.get(where.id);
          return ref ? { ...ref } : null;
        }),
        findMany: jest.fn(async () => Array.from(dbReferrals.values())),
        count: jest.fn(async () => dbReferrals.size),
        update: jest.fn(async ({ where, data }) => {
          const existing = dbReferrals.get(where.id);
          if (!existing) throw new Error('Referral not found');
          const updated = { ...existing, ...data, updatedAt: new Date() };
          dbReferrals.set(where.id, updated);
          return { ...updated };
        }),
        groupBy: jest.fn(async ({ by, where }) => {
          const all = Array.from(dbReferrals.values());
          const groupMap = new Map<string, number>();
          const field = by[0];
          for (const item of all) {
            const key = item[field];
            groupMap.set(key, (groupMap.get(key) || 0) + 1);
          }
          return Array.from(groupMap.entries()).map(([k, v]) => ({
            [field]: k,
            _count: v,
          }));
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
        findMany: jest.fn(async ({ where }) => {
          return dbAssignments.filter((a) => a.referralId === where.referralId);
        }),
        findFirst: jest.fn(async ({ where }) => {
          return (
            dbAssignments.find(
              (a) =>
                a.referralId === where.referralId &&
                (!where.role || a.role === where.role),
            ) || null
          );
        }),
      },
      workflowTransition: {
        create: jest.fn(async ({ data }) => {
          const record = { ...data, id: 'trans-' + (dbTransitions.length + 1) };
          dbTransitions.push(record);
          return record;
        }),
        findMany: jest.fn(async ({ where, take, skip, orderBy }) => {
          let res = dbTransitions.filter((t) => t.referralId === where.referralId);
          if (orderBy && orderBy.transitionedAt === 'desc') {
            res = [...res].reverse();
          }
          if (skip) res = res.slice(skip);
          if (take) res = res.slice(0, take);
          return res;
        }),
        count: jest.fn(async ({ where }) => {
          return dbTransitions.filter((t) => t.referralId === where.referralId).length;
        }),
      },
      eventOutbox: {
        create: jest.fn(async ({ data }) => {
          const record = {
            ...data,
            id: 'outbox-' + (dbOutbox.length + 1),
            createdAt: new Date(),
          };
          dbOutbox.push(record);
          return record;
        }),
        findMany: jest.fn(async ({ where, take }) => {
          let res = dbOutbox.filter((e) => !where?.status || e.status === where.status);
          if (take) res = res.slice(0, take);
          return res;
        }),
        update: jest.fn(async ({ where, data }) => {
          const ev = dbOutbox.find((e) => e.id === where.id);
          if (ev) Object.assign(ev, data);
          return ev;
        }),
      },
      clinicalReview: {
        findFirst: jest.fn(async ({ where }) => {
          return (
            dbClinicalReviews.find(
              (r) =>
                r.referralId === where.referralId &&
                (!where.decision || r.decision === where.decision),
            ) || null
          );
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
        create: jest.fn(async ({ data }) => {
          const record = { ...data, id: 'appt-' + (dbAppointments.length + 1) };
          dbAppointments.push(record);
          return record;
        }),
      },
      encounter: {
        findFirst: jest.fn(async ({ where }) => {
          return (
            dbEncounters.find(
              (e) =>
                e.referralId === where.referralId &&
                (!where.outcome || e.outcome === where.outcome),
            ) || null
          );
        }),
        create: jest.fn(async ({ data }) => {
          const record = { ...data, id: 'enc-' + (dbEncounters.length + 1) };
          dbEncounters.push(record);
          return record;
        }),
      },
      clinicalNote: {
        findFirst: jest.fn(async ({ where }) => {
          return (
            dbClinicalNotes.find(
              (n) =>
                n.referralId === where.referralId &&
                (!where.encounterId || n.encounterId === where.encounterId) &&
                (!where.submittedAt || n.submittedAt !== null),
            ) || null
          );
        }),
        create: jest.fn(async ({ data }) => {
          const record = { ...data, id: 'note-' + (dbClinicalNotes.length + 1) };
          dbClinicalNotes.push(record);
          return record;
        }),
      },
      noteReview: {
        findFirst: jest.fn(async ({ where }) => {
          return (
            dbNoteReviews.find(
              (r) =>
                (!where.clinicalNoteId || r.clinicalNoteId === where.clinicalNoteId) &&
                (!where.decision || r.decision === where.decision),
            ) || null
          );
        }),
        create: jest.fn(async ({ data }) => {
          const record = { ...data, id: 'nr-' + (dbNoteReviews.length + 1) };
          dbNoteReviews.push(record);
          return record;
        }),
      },
      idempotencyKey: {
        findUnique: jest.fn(async ({ where }) => dbIdempotencyKeys.get(where.key) || null),
        create: jest.fn(async ({ data }) => {
          dbIdempotencyKeys.set(data.key, data);
          return data;
        }),
        upsert: jest.fn(async ({ where, create, update }) => {
          const existing = dbIdempotencyKeys.get(where.key);
          const res = existing ? { ...existing, ...update } : { ...create };
          dbIdempotencyKeys.set(where.key, res);
          return res;
        }),
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
          if (k.startsWith(prefix)) {
            redisCache.delete(k);
          }
        }
      }),
      getJson: jest.fn(async (key: string) => {
        const data = redisCache.get(key);
        return data ? JSON.parse(data) : null;
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
        {
          provide: AuditService,
          useValue: {
            recordEvent: jest.fn().mockResolvedValue({ id: 'audit-e2e-1' }),
            logPhiAccess: jest.fn().mockResolvedValue({ id: 'audit-e2e-1' }),
          },
        },
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
  // Task 14.1: Complete Happy Path Workflow
  // ============================================================================
  it('Task 14.1: should execute the complete happy path workflow from Intake to Billing with audit integrity', async () => {
    // 1. Create Patient Referral via API
    const referral = await referralsService.create(
      {
        patientId: 'pat-100',
        referralSource: 'Tampa General Hospital',
        insurancePayer: 'Blue Cross Blue Shield',
        site: 'Site-A',
        state: 'FL',
        legalEntity: 'HEALS_FL',
        coverageVerified: true,
        coverageVerificationDate: new Date(),
        priority: 'ROUTINE',
      },
      intakeUser,
    );

    expect(referral.id).toBeDefined();
    expect(referral.pipelineStage).toBe(PipelineStage.INTAKE);
    expect(referral.workStatus).toBe(WorkStatus.PENDING);
    expect(referral.version).toBe(1);

    // 2. INTAKE -> CLINICAL_REVIEW
    const res1 = await workflowService.executeTransition(
      referral.id,
      {
        targetStage: PipelineStage.CLINICAL_REVIEW,
        version: 1,
        reason: 'Intake and insurance coverage verified',
      },
      intakeUser,
    );

    expect(res1.success).toBe(true);
    expect(res1.referral.pipelineStage).toBe(PipelineStage.CLINICAL_REVIEW);
    expect(res1.referral.version).toBe(2);
    expect(res1.referral.assignedRole).toBe(UserRole.CLINICAL_REVIEWER);

    // 3. Clinical Review Decision: ACCEPT
    dbClinicalReviews.push({
      id: 'cr-1',
      referralId: referral.id,
      reviewerId: reviewerUser.userId,
      decision: ClinicalReviewDecision.ACCEPT,
      criteriaMet: true,
      notes: 'Patient clinically eligible for mobile home care',
      createdAt: new Date(),
    });

    // 4. CLINICAL_REVIEW -> SCHEDULING
    const res2 = await workflowService.executeTransition(
      referral.id,
      {
        targetStage: PipelineStage.SCHEDULING,
        version: 2,
        reason: 'Clinical acceptance confirmed',
      },
      reviewerUser,
    );

    expect(res2.success).toBe(true);
    expect(res2.referral.pipelineStage).toBe(PipelineStage.SCHEDULING);
    expect(res2.referral.version).toBe(3);
    expect(res2.referral.assignedRole).toBe(UserRole.SCHEDULER);

    // 5. Schedule Appointment
    dbAppointments.push({
      id: 'appt-1',
      referralId: referral.id,
      patientId: referral.patientId,
      status: 'CONFIRMED',
      confirmedAt: new Date(),
      nursePractitionerId: npUser.userId,
      scheduledDate: new Date(Date.now() + 86400000),
      createdAt: new Date(),
    });

    // 6. SCHEDULING -> NP_VISIT
    const res3 = await workflowService.executeTransition(
      referral.id,
      {
        targetStage: PipelineStage.NP_VISIT,
        version: 3,
        reason: 'Appointment confirmed with patient and family',
        metadata: { npId: npUser.userId },
      },
      schedulerUser,
    );

    expect(res3.success).toBe(true);
    expect(res3.referral.pipelineStage).toBe(PipelineStage.NP_VISIT);
    expect(res3.referral.version).toBe(4);
    expect(res3.referral.assignedRole).toBe(UserRole.NURSE_PRACTITIONER);
    expect(res3.referral.assignedTo).toBe(npUser.userId);

    // 7. Complete NP Visit & Clinical Note
    dbEncounters.push({
      id: 'enc-1',
      referralId: referral.id,
      providerId: npUser.userId,
      status: 'COMPLETED',
      outcome: 'COMPLETED',
      dateOfService: new Date(),
      servicesProvided: ['HOME_HEALTH_EVAL'],
      visitDate: new Date(),
      createdAt: new Date(),
    });
    dbClinicalNotes.push({
      id: 'note-1',
      referralId: referral.id,
      encounterId: 'enc-1',
      providerId: npUser.userId,
      status: 'SIGNED',
      submittedAt: new Date(),
      createdAt: new Date(),
    });

    // 8. NP_VISIT -> NOTES_QA
    const res4 = await workflowService.executeTransition(
      referral.id,
      {
        targetStage: PipelineStage.NOTES_QA,
        version: 4,
        reason: 'Clinical encounter complete and signed note submitted',
      },
      npUser,
    );

    expect(res4.success).toBe(true);
    expect(res4.referral.pipelineStage).toBe(PipelineStage.NOTES_QA);
    expect(res4.referral.version).toBe(5);
    expect(res4.referral.assignedRole).toBe(UserRole.CLINICAL_REVIEWER);

    // 9. QA Review & Billing Approval
    const activeRef = dbReferrals.get(referral.id);
    activeRef.billingStatus = BillingStatus.READY;

    dbNoteReviews.push({
      id: 'nr-1',
      clinicalNoteId: 'note-1',
      reviewerId: reviewerUser.userId,
      decision: 'APPROVE',
      billingStatus: BillingStatus.READY,
      reviewedAt: new Date(),
      createdAt: new Date(),
    });

    // 10. NOTES_QA -> BILLING
    const res5 = await workflowService.executeTransition(
      referral.id,
      {
        targetStage: PipelineStage.BILLING,
        version: 5,
        reason: 'Clinical note approved with billing code readiness',
      },
      reviewerUser,
    );

    expect(res5.success).toBe(true);
    expect(res5.referral.pipelineStage).toBe(PipelineStage.BILLING);
    expect(res5.referral.version).toBe(6);
    expect(res5.referral.assignedRole).toBe(UserRole.BILLING_COORDINATOR);

    // 11. Verify complete chronological audit trail
    const history = await workflowService.getWorkflowHistory(referral.id, adminUser);
    expect(history).toHaveLength(5);

    expect(history[0].fromStage).toBe(PipelineStage.INTAKE);
    expect(history[0].toStage).toBe(PipelineStage.CLINICAL_REVIEW);

    expect(history[1].fromStage).toBe(PipelineStage.CLINICAL_REVIEW);
    expect(history[1].toStage).toBe(PipelineStage.SCHEDULING);

    expect(history[2].fromStage).toBe(PipelineStage.SCHEDULING);
    expect(history[2].toStage).toBe(PipelineStage.NP_VISIT);

    expect(history[3].fromStage).toBe(PipelineStage.NP_VISIT);
    expect(history[3].toStage).toBe(PipelineStage.NOTES_QA);

    expect(history[4].fromStage).toBe(PipelineStage.NOTES_QA);
    expect(history[4].toStage).toBe(PipelineStage.BILLING);
  });

  // ============================================================================
  // Task 14.2: Return and Resubmit Cycle
  // ============================================================================
  it('Task 14.2: should support return from CLINICAL_REVIEW to INTAKE and subsequent resubmission', async () => {
    createTestReferral('ref-return-1', PipelineStage.CLINICAL_REVIEW, 2);

    // 1. Clinical Reviewer returns to INTAKE for missing records
    const returnResult = await workflowService.executeTransition(
      'ref-return-1',
      {
        targetStage: PipelineStage.INTAKE,
        version: 2,
        reason: 'Missing prior hospital discharge summary and medication list',
      },
      reviewerUser,
    );

    expect(returnResult.success).toBe(true);
    expect(returnResult.referral.pipelineStage).toBe(PipelineStage.INTAKE);
    expect(returnResult.referral.version).toBe(3);
    expect(returnResult.referral.assignedRole).toBe(UserRole.INTAKE_SPECIALIST);

    // 2. Intake specialist resolves documentation, sets status IN_PROGRESS
    const updatedStatus = await workflowService.updateWorkStatus(
      'ref-return-1',
      {
        workStatus: WorkStatus.IN_PROGRESS,
        version: 3,
        reason: 'Contacted hospital and acquired discharge summary',
      },
      intakeUser,
    );
    expect(updatedStatus.workStatus).toBe(WorkStatus.IN_PROGRESS);
    expect(updatedStatus.version).toBe(4);

    // 3. Resubmit INTAKE -> CLINICAL_REVIEW
    const resubmitResult = await workflowService.executeTransition(
      'ref-return-1',
      {
        targetStage: PipelineStage.CLINICAL_REVIEW,
        version: 4,
        reason: 'Discharge records uploaded, resubmitting for review',
      },
      intakeUser,
    );

    expect(resubmitResult.success).toBe(true);
    expect(resubmitResult.referral.pipelineStage).toBe(PipelineStage.CLINICAL_REVIEW);
    expect(resubmitResult.referral.version).toBe(5);
    expect(resubmitResult.referral.assignedRole).toBe(UserRole.CLINICAL_REVIEWER);

    // Verify audit trail preserved both return and resubmit
    const history = await workflowService.getWorkflowHistory('ref-return-1', adminUser);
    expect(history).toHaveLength(3); // return + status change + resubmit
  });

  // ============================================================================
  // Task 14.3: No-Show Flow
  // ============================================================================
  it('Task 14.3: should support backward transition from NP_VISIT to SCHEDULING on patient no-show', async () => {
    createTestReferral('ref-noshow-1', PipelineStage.NP_VISIT, 4);

    // Record encounter outcome: NO_SHOW
    dbEncounters.push({
      id: 'enc-noshow-1',
      referralId: 'ref-noshow-1',
      providerId: npUser.userId,
      outcome: 'NO_SHOW',
      status: 'CANCELLED',
      createdAt: new Date(),
    });

    // Backward transition: NP_VISIT -> SCHEDULING
    const result = await workflowService.executeTransition(
      'ref-noshow-1',
      {
        targetStage: PipelineStage.SCHEDULING,
        version: 4,
        reason: 'Patient was not home for scheduled visit; returned to scheduling for rebooking',
      },
      npUser,
    );

    expect(result.success).toBe(true);
    expect(result.referral.pipelineStage).toBe(PipelineStage.SCHEDULING);
    expect(result.referral.version).toBe(5);
    expect(result.referral.assignedRole).toBe(UserRole.SCHEDULER);

    // Verify encounter record remains intact
    const savedEncounter = dbEncounters.find((e) => e.referralId === 'ref-noshow-1');
    expect(savedEncounter).toBeDefined();
    expect(savedEncounter.outcome).toBe('NO_SHOW');
  });

  // ============================================================================
  // Task 14.4: Note Correction Flow
  // ============================================================================
  it('Task 14.4: should return from NOTES_QA to NP_VISIT, reassign to original NP, and allow resubmission', async () => {
    createTestReferral('ref-qa-1', PipelineStage.NOTES_QA, 5);

    // Previous assignment to NP
    dbAssignments.push({
      id: 'assign-prev-np',
      referralId: 'ref-qa-1',
      userId: npUser.userId,
      role: UserRole.NURSE_PRACTITIONER,
      assignedAt: new Date(Date.now() - 100000),
      unassignedAt: new Date(),
    });

    // Note in database
    dbClinicalNotes.push({
      id: 'note-draft-1',
      referralId: 'ref-qa-1',
      encounterId: 'enc-rev-1',
      providerId: npUser.userId,
      status: 'SIGNED',
      submittedAt: new Date(),
    });

    // 1. NOTES_QA reviewer returns to NP_VISIT
    const returnResult = await workflowService.executeTransition(
      'ref-qa-1',
      {
        targetStage: PipelineStage.NP_VISIT,
        version: 5,
        reason: 'Please specify bilateral foot edema staging in physical exam',
      },
      reviewerUser,
    );

    expect(returnResult.success).toBe(true);
    expect(returnResult.referral.pipelineStage).toBe(PipelineStage.NP_VISIT);
    expect(returnResult.referral.version).toBe(6);
    // Verified: routes back to original NP
    expect(returnResult.referral.assignedTo).toBe(npUser.userId);

    // 2. NP revises note and resubmits to NOTES_QA
    dbEncounters.push({
      id: 'enc-rev-1',
      referralId: 'ref-qa-1',
      outcome: 'COMPLETED',
      dateOfService: new Date(),
      servicesProvided: ['HOME_HEALTH_EVAL'],
      status: 'COMPLETED',
    });

    const resubmitResult = await workflowService.executeTransition(
      'ref-qa-1',
      {
        targetStage: PipelineStage.NOTES_QA,
        version: 6,
        reason: 'Physical exam revised with Stage II bilateral edema documentation',
      },
      npUser,
    );

    expect(resubmitResult.success).toBe(true);
    expect(resubmitResult.referral.pipelineStage).toBe(PipelineStage.NOTES_QA);
    expect(resubmitResult.referral.version).toBe(7);
  });

  // ============================================================================
  // Task 14.5: Concurrent Transition Handling
  // ============================================================================
  it('Task 14.5: should ensure exactly 1 transition succeeds and 9 receive 409 conflict under concurrent attempts', async () => {
    createTestReferral('ref-concurrent-1', PipelineStage.INTAKE, 1);

    // 10 concurrent requests with initial version 1
    const attempts = Array.from({ length: 10 }).map((_, i) =>
      workflowService.executeTransition(
        'ref-concurrent-1',
        {
          targetStage: PipelineStage.CLINICAL_REVIEW,
          version: 1,
          reason: `Concurrent transition attempt #${i + 1}`,
        },
        intakeUser,
      ),
    );

    const results = await Promise.allSettled(attempts);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    // Exactly 1 must succeed
    expect(fulfilled).toHaveLength(1);
    // Other 9 must fail with VersionConflictException
    expect(rejected).toHaveLength(9);

    for (const rej of rejected) {
      if (rej.status === 'rejected') {
        expect(rej.reason).toBeInstanceOf(VersionConflictException);
        expect((rej.reason as VersionConflictException).currentVersion).toBe(2);
      }
    }

    // Single version increment from 1 to 2
    const finalReferral = dbReferrals.get('ref-concurrent-1');
    expect(finalReferral.version).toBe(2);
    expect(finalReferral.pipelineStage).toBe(PipelineStage.CLINICAL_REVIEW);

    // Exactly one transition record created
    const transitions = dbTransitions.filter((t) => t.referralId === 'ref-concurrent-1');
    expect(transitions).toHaveLength(1);
  });

  // ============================================================================
  // Task 14.6: Idempotency Key Handling
  // ============================================================================
  it('Task 14.6: should return cached transition response on idempotency key replay without duplicating transition', async () => {
    createTestReferral('ref-idemp-1', PipelineStage.INTAKE, 1);

    const idempotencyKey = 'idemp-uuid-happy-path-1001';

    // 1. Initial execution
    const firstResult = await workflowService.executeTransition(
      'ref-idemp-1',
      {
        targetStage: PipelineStage.CLINICAL_REVIEW,
        version: 1,
        idempotencyKey,
        reason: 'First submission with idempotency key',
      },
      intakeUser,
    );

    expect(firstResult.success).toBe(true);
    expect(firstResult.referral.version).toBe(2);

    // 2. Replay with exact same idempotency key and payload (simulating client retry)
    const secondResult = await workflowService.executeTransition(
      'ref-idemp-1',
      {
        targetStage: PipelineStage.CLINICAL_REVIEW,
        version: 1,
        idempotencyKey,
        reason: 'First submission with idempotency key',
      },
      intakeUser,
    );

    // Returns cached identical response
    expect(secondResult.success).toBe(true);
    expect(secondResult.referral.id).toBe(firstResult.referral.id);
    expect(secondResult.referral.version).toBe(2); // Still 2, not incremented again!

    // Verify only ONE audit record exists
    const transitions = dbTransitions.filter((t) => t.referralId === 'ref-idemp-1');
    expect(transitions).toHaveLength(1);

    // 3. Reusing same idempotency key with DIFFERENT payload must throw ConflictException
    await expect(
      workflowService.executeTransition(
        'ref-idemp-1',
        {
          targetStage: PipelineStage.CLINICAL_REVIEW,
          version: 1,
          idempotencyKey,
          reason: 'Tampered reason with same key',
        },
        intakeUser,
      ),
    ).rejects.toThrow(ConflictException);
  });

  // ============================================================================
  // Task 14.7: Event Outbox Processing
  // ============================================================================
  it('Task 14.7: should process pending outbox events and mark them PUBLISHED without duplication', async () => {
    createTestReferral('ref-outbox-1', PipelineStage.INTAKE, 1);

    // Execute transition to create outbox event
    await workflowService.executeTransition(
      'ref-outbox-1',
      {
        targetStage: PipelineStage.CLINICAL_REVIEW,
        version: 1,
        reason: 'Enqueuing event test',
      },
      intakeUser,
    );

    expect(dbOutbox.length).toBeGreaterThan(0);
    const pendingEvent = dbOutbox[0];
    expect(pendingEvent.status).toBe('PENDING');

    // Run outbox processor
    const processResult = await eventService.processOutbox(10);

    expect(processResult.processed).toBeGreaterThan(0);
    expect(processResult.succeeded).toBeGreaterThan(0);
    expect(processResult.failed).toBe(0);

    // Verify outbox record status updated to PUBLISHED
    expect(pendingEvent.status).toBe('PUBLISHED');
    expect(pendingEvent.publishedAt).toBeDefined();

    // Re-run processor - should process 0 pending events
    const secondPass = await eventService.processOutbox(10);
    expect(secondPass.processed).toBe(0);
  });

  // ============================================================================
  // Task 15.3: Terminal State Enforcement
  // ============================================================================
  it('Task 15.3: should block forward transitions when referral has terminal caseOutcome (REJECTED)', async () => {
    createTestReferral('ref-terminal-1', PipelineStage.INTAKE, 1, {
      caseOutcome: CaseOutcome.REJECTED,
    });

    await expect(
      workflowService.executeTransition(
        'ref-terminal-1',
        {
          targetStage: PipelineStage.CLINICAL_REVIEW,
          version: 1,
          reason: 'Attempt transition while rejected',
        },
        intakeUser,
      ),
    ).rejects.toThrow(WorkflowValidationException);

    try {
      await workflowService.executeTransition(
        'ref-terminal-1',
        {
          targetStage: PipelineStage.CLINICAL_REVIEW,
          version: 1,
          reason: 'Attempt transition while rejected',
        },
        intakeUser,
      );
    } catch (e: any) {
      expect(e).toBeInstanceOf(WorkflowValidationException);
      expect(e.errors[0].field).toBe('caseOutcome');
      expect(e.errors[0].message).toContain('terminal state');
    }

    // Referral state and version remain completely unmodified
    const untouched = dbReferrals.get('ref-terminal-1');
    expect(untouched.pipelineStage).toBe(PipelineStage.INTAKE);
    expect(untouched.version).toBe(1);
    expect(untouched.caseOutcome).toBe(CaseOutcome.REJECTED);
  });
});
