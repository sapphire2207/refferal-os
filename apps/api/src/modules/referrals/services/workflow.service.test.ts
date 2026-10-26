import { Test, TestingModule } from '@nestjs/testing';
import { WorkflowService } from './workflow.service';
import { PrismaService } from '../../../database/prisma.service';
import { RedisService } from '../../../redis/redis.service';
import { ValidationService } from './validation.service';
import { GatewayCheckService } from './gateway-check.service';
import { EventService } from './event.service';
import { AssignmentService } from './assignment.service';
import {
  PipelineStage,
  WorkStatus,
  UserRole,
  AuthTokenPayload,
} from '@heals/types';
import { Referral, WorkflowTransition } from '@prisma/client';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import {
  WorkflowValidationException,
  VersionConflictException,
} from '../exceptions/workflow.exceptions';

describe('WorkflowService', () => {
  let service: WorkflowService;
  let prisma: jest.Mocked<PrismaService>;
  let validationService: jest.Mocked<ValidationService>;
  let gatewayCheckService: jest.Mocked<GatewayCheckService>;
  let eventService: jest.Mocked<EventService>;
  let assignmentService: jest.Mocked<AssignmentService>;
  let redisService: jest.Mocked<RedisService>;

  const mockUser: AuthTokenPayload = {
    userId: 'user-auth-1',
    email: 'reviewer@heals.com',
    sessionId: 'session-1',
    iat: 1000000,
    exp: 2000000,
    roles: [UserRole.CLINICAL_REVIEWER],
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
    assignedTo: 'user-intake-1',
    assignedRole: UserRole.INTAKE_SPECIALIST,
    coverageVerified: true,
  } as unknown as Referral;

  const mockPrisma = {
    referral: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    workflowTransition: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    idempotencyKey: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
  };

  const mockValidationService = {
    checkAuthorization: jest.fn(),
    checkScope: jest.fn(),
    validateTransitionPath: jest.fn(),
    validateVersion: jest.fn(),
    checkTerminalState: jest.fn().mockReturnValue({ valid: true, errors: [] }),
  };

  const mockGatewayCheckService = {
    checkGatesForTransition: jest.fn(),
  };

  const mockEventService = {
    enqueueEvent: jest.fn(),
  };

  const mockAssignmentService = {
    determineAssignment: jest.fn(),
    assignToUser: jest.fn(),
    assignToRoleQueue: jest.fn(),
  };

  const mockRedisService = {
    getJson: jest.fn(),
    setJson: jest.fn(),
    del: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ValidationService, useValue: mockValidationService },
        { provide: GatewayCheckService, useValue: mockGatewayCheckService },
        { provide: EventService, useValue: mockEventService },
        { provide: AssignmentService, useValue: mockAssignmentService },
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    service = module.get<WorkflowService>(WorkflowService);
    prisma = module.get(PrismaService);
    validationService = module.get(ValidationService);
    gatewayCheckService = module.get(GatewayCheckService);
    eventService = module.get(EventService);
    assignmentService = module.get(AssignmentService);
    redisService = module.get(RedisService);

    mockValidationService.checkTerminalState.mockReturnValue({ valid: true, errors: [] });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================================
  // validateTransition Tests (Task 8.2 & 8.3)
  // ============================================================================
  describe('validateTransition', () => {
    it('should return valid=true when all checks pass', async () => {
      mockValidationService.checkAuthorization.mockResolvedValue(true);
      mockValidationService.checkScope.mockResolvedValue(true);
      mockValidationService.validateTransitionPath.mockReturnValue(true);
      mockGatewayCheckService.checkGatesForTransition.mockResolvedValue({
        valid: true,
        errors: [],
      });

      const result = await service.validateTransition({
        referral: mockReferral,
        targetStage: PipelineStage.CLINICAL_REVIEW,
        user: mockUser,
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should catch authorization failure', async () => {
      mockValidationService.checkAuthorization.mockResolvedValue(false);
      mockValidationService.checkScope.mockResolvedValue(true);
      mockValidationService.validateTransitionPath.mockReturnValue(true);
      mockGatewayCheckService.checkGatesForTransition.mockResolvedValue({
        valid: true,
        errors: [],
      });

      const result = await service.validateTransition({
        referral: mockReferral,
        targetStage: PipelineStage.CLINICAL_REVIEW,
        user: mockUser,
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.type === 'permission')).toBe(true);
    });

    it('should catch scope failure', async () => {
      mockValidationService.checkAuthorization.mockResolvedValue(true);
      mockValidationService.checkScope.mockResolvedValue(false);
      mockValidationService.validateTransitionPath.mockReturnValue(true);
      mockGatewayCheckService.checkGatesForTransition.mockResolvedValue({
        valid: true,
        errors: [],
      });

      const result = await service.validateTransition({
        referral: mockReferral,
        targetStage: PipelineStage.CLINICAL_REVIEW,
        user: mockUser,
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.type === 'scope')).toBe(true);
    });

    it('should catch invalid transition path', async () => {
      mockValidationService.checkAuthorization.mockResolvedValue(true);
      mockValidationService.checkScope.mockResolvedValue(true);
      mockValidationService.validateTransitionPath.mockReturnValue(false);
      mockGatewayCheckService.checkGatesForTransition.mockResolvedValue({
        valid: true,
        errors: [],
      });

      const result = await service.validateTransition({
        referral: mockReferral,
        targetStage: PipelineStage.BILLING, // Invalid from INTAKE
        user: mockUser,
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.type === 'transition')).toBe(true);
    });

    it('should catch gate check failure', async () => {
      mockValidationService.checkAuthorization.mockResolvedValue(true);
      mockValidationService.checkScope.mockResolvedValue(true);
      mockValidationService.validateTransitionPath.mockReturnValue(true);
      mockGatewayCheckService.checkGatesForTransition.mockResolvedValue({
        valid: false,
        errors: [
          {
            type: 'gate',
            field: 'coverageVerified',
            message: 'Insurance coverage must be verified',
          },
        ],
      });

      const result = await service.validateTransition({
        referral: mockReferral,
        targetStage: PipelineStage.CLINICAL_REVIEW,
        user: mockUser,
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'coverageVerified')).toBe(true);
    });

    it('should aggregate multiple simultaneous failures', async () => {
      mockValidationService.checkAuthorization.mockResolvedValue(false);
      mockValidationService.checkScope.mockResolvedValue(false);
      mockValidationService.validateTransitionPath.mockReturnValue(false);
      mockGatewayCheckService.checkGatesForTransition.mockResolvedValue({
        valid: false,
        errors: [{ type: 'gate', message: 'Gate failure' }],
      });

      const result = await service.validateTransition({
        referral: mockReferral,
        targetStage: PipelineStage.BILLING,
        user: mockUser,
      });

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(4);
    });

    it('should catch terminal state blocking forward transition', async () => {
      mockValidationService.checkTerminalState.mockReturnValue({
        valid: false,
        errors: [{ type: 'transition', field: 'caseOutcome', message: 'Terminal state' }],
      });
      mockValidationService.checkAuthorization.mockResolvedValue(true);
      mockValidationService.checkScope.mockResolvedValue(true);
      mockValidationService.validateTransitionPath.mockReturnValue(true);
      mockGatewayCheckService.checkGatesForTransition.mockResolvedValue({
        valid: true,
        errors: [],
      });

      const result = await service.validateTransition({
        referral: { ...mockReferral, caseOutcome: 'REJECTED' as any },
        targetStage: PipelineStage.CLINICAL_REVIEW,
        user: mockUser,
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'caseOutcome')).toBe(true);
    });
  });

  // ============================================================================
  // executeTransition Happy Path Tests (Task 8.9)
  // ============================================================================
  describe('executeTransition - Happy Path', () => {
    it('should successfully execute transition, increment version, create audit, and enqueue event', async () => {
      mockRedisService.getJson.mockResolvedValue(null);
      mockPrisma.referral.findUnique.mockResolvedValue(mockReferral);

      // Validation passes
      mockValidationService.checkAuthorization.mockResolvedValue(true);
      mockValidationService.checkScope.mockResolvedValue(true);
      mockValidationService.validateTransitionPath.mockReturnValue(true);
      mockGatewayCheckService.checkGatesForTransition.mockResolvedValue({
        valid: true,
        errors: [],
      });

      const updatedRef = {
        ...mockReferral,
        pipelineStage: PipelineStage.CLINICAL_REVIEW,
        workStatus: WorkStatus.PENDING,
        version: 2,
      };

      const mockTransitionRecord: WorkflowTransition = {
        id: 'transition-123',
        referralId: 'ref-1',
        fromStage: PipelineStage.INTAKE,
        toStage: PipelineStage.CLINICAL_REVIEW,
        fromStatus: WorkStatus.PENDING,
        toStatus: WorkStatus.PENDING,
        transitionedBy: mockUser.userId,
        reason: 'Intake complete',
        metadata: null,
        transitionedAt: new Date(),
      };

      // Mock transaction callback
      mockPrisma.$transaction.mockImplementation(async (callback) => {
        const tx = {
          $queryRaw: jest.fn().mockResolvedValue([mockReferral]),
          referral: {
            findUnique: jest.fn().mockResolvedValue(updatedRef),
            update: jest.fn().mockResolvedValue(updatedRef),
          },
          workflowTransition: {
            create: jest.fn().mockResolvedValue(mockTransitionRecord),
          },
        };
        return callback(tx);
      });

      mockAssignmentService.determineAssignment.mockResolvedValue({
        role: UserRole.CLINICAL_REVIEWER,
        userId: 'reviewer-1',
      });
      mockAssignmentService.assignToUser.mockResolvedValue(undefined);
      mockEventService.enqueueEvent.mockResolvedValue({} as any);

      const result = await service.executeTransition(
        'ref-1',
        {
          targetStage: PipelineStage.CLINICAL_REVIEW,
          version: 1,
          reason: 'Intake complete',
        },
        mockUser,
      );

      expect(result.success).toBe(true);
      expect(result.referral.version).toBe(2);
      expect(result.referral.pipelineStage).toBe(PipelineStage.CLINICAL_REVIEW);
      expect(result.transition.id).toBe('transition-123');
      expect(mockAssignmentService.determineAssignment).toHaveBeenCalled();
      expect(mockAssignmentService.assignToUser).toHaveBeenCalled();
      expect(mockEventService.enqueueEvent).toHaveBeenCalledWith(
        'referral.stage.changed',
        'ref-1',
        expect.objectContaining({
          fromStage: PipelineStage.INTAKE,
          toStage: PipelineStage.CLINICAL_REVIEW,
          version: 2,
        }),
        expect.anything(),
      );
    });
  });

  // ============================================================================
  // executeTransition Error Cases Tests (Task 8.10)
  // ============================================================================
  describe('executeTransition - Error Handling', () => {
    it('should throw NotFoundException if referral does not exist', async () => {
      mockPrisma.referral.findUnique.mockResolvedValue(null);

      await expect(
        service.executeTransition(
          'nonexistent',
          { targetStage: PipelineStage.CLINICAL_REVIEW, version: 1 },
          mockUser,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw VersionConflictException when requested version mismatches referral version', async () => {
      mockPrisma.referral.findUnique.mockResolvedValue(mockReferral); // version: 1

      await expect(
        service.executeTransition(
          'ref-1',
          { targetStage: PipelineStage.CLINICAL_REVIEW, version: 99 }, // version mismatch
          mockUser,
        ),
      ).rejects.toThrow(VersionConflictException);
    });

    it('should throw WorkflowValidationException if validation rules fail', async () => {
      mockPrisma.referral.findUnique.mockResolvedValue(mockReferral);

      mockValidationService.checkAuthorization.mockResolvedValue(true);
      mockValidationService.checkScope.mockResolvedValue(true);
      mockValidationService.validateTransitionPath.mockReturnValue(false); // Invalid path
      mockGatewayCheckService.checkGatesForTransition.mockResolvedValue({
        valid: true,
        errors: [],
      });

      await expect(
        service.executeTransition(
          'ref-1',
          { targetStage: PipelineStage.BILLING, version: 1 },
          mockUser,
        ),
      ).rejects.toThrow(WorkflowValidationException);
    });

    it('should abort and rollback if transaction encounters error', async () => {
      mockPrisma.referral.findUnique.mockResolvedValue(mockReferral);

      mockValidationService.checkAuthorization.mockResolvedValue(true);
      mockValidationService.checkScope.mockResolvedValue(true);
      mockValidationService.validateTransitionPath.mockReturnValue(true);
      mockGatewayCheckService.checkGatesForTransition.mockResolvedValue({
        valid: true,
        errors: [],
      });

      mockPrisma.$transaction.mockRejectedValue(new Error('DB Connection Timeout'));

      await expect(
        service.executeTransition(
          'ref-1',
          { targetStage: PipelineStage.CLINICAL_REVIEW, version: 1 },
          mockUser,
        ),
      ).rejects.toThrow('DB Connection Timeout');
    });
  });

  // ============================================================================
  // executeTransition Idempotency Tests (Task 8.11)
  // ============================================================================
  describe('executeTransition - Idempotency', () => {
    it('should return cached response when idempotency key is found in Redis', async () => {
      const cachedResult = {
        success: true,
        referral: { ...mockReferral, version: 2 },
        transition: { id: 'cached-trans-1' },
      };

      mockRedisService.getJson.mockResolvedValue(cachedResult);

      const result = await service.executeTransition(
        'ref-1',
        {
          targetStage: PipelineStage.CLINICAL_REVIEW,
          version: 1,
          idempotencyKey: 'idemp-key-123',
        },
        mockUser,
      );

      expect(result).toEqual(cachedResult);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('should reject with ConflictException if idempotency key is reused with different request payload', async () => {
      mockRedisService.getJson.mockResolvedValue(null);
      mockPrisma.idempotencyKey.findUnique.mockResolvedValue({
        id: 'key-1',
        key: 'idemp-key-123',
        requestHash: 'different-hash-val',
        responseStatus: 200,
        responseBody: {},
        expiresAt: new Date(Date.now() + 60000),
        createdAt: new Date(),
      });

      await expect(
        service.executeTransition(
          'ref-1',
          {
            targetStage: PipelineStage.CLINICAL_REVIEW,
            version: 1,
            idempotencyKey: 'idemp-key-123',
          },
          mockUser,
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ============================================================================
  // updateWorkStatus Tests (Task 9.1 & 9.2)
  // ============================================================================
  describe('updateWorkStatus', () => {
    it('should successfully update work status from PENDING to IN_PROGRESS', async () => {
      mockPrisma.referral.findUnique.mockResolvedValue(mockReferral);
      mockValidationService.checkScope.mockResolvedValue(true);

      const updatedRef = {
        ...mockReferral,
        workStatus: WorkStatus.IN_PROGRESS,
        version: 2,
      };

      mockPrisma.$transaction.mockImplementation(async (callback) => {
        const tx = {
          referral: { update: jest.fn().mockResolvedValue(updatedRef) },
          workflowTransition: { create: jest.fn().mockResolvedValue({}) },
        };
        return callback(tx);
      });

      const result = await service.updateWorkStatus(
        'ref-1',
        {
          workStatus: WorkStatus.IN_PROGRESS,
          version: 1,
        },
        mockUser,
      );

      expect(result.workStatus).toBe(WorkStatus.IN_PROGRESS);
      expect(result.version).toBe(2);
      expect(mockEventService.enqueueEvent).toHaveBeenCalledWith(
        'referral.work_status.changed',
        'ref-1',
        expect.anything(),
        expect.anything(),
      );
    });

    it('should throw BadRequestException if transition is invalid per WORK_STATUS_TRANSITIONS', async () => {
      const completedReferral = {
        ...mockReferral,
        workStatus: WorkStatus.COMPLETED,
      };
      mockPrisma.referral.findUnique.mockResolvedValue(completedReferral);
      mockValidationService.checkScope.mockResolvedValue(true);

      await expect(
        service.updateWorkStatus(
          'ref-1',
          {
            workStatus: WorkStatus.IN_PROGRESS, // Invalid from COMPLETED
            version: 1,
          },
          mockUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if BLOCKED_NEEDS_INFO is set without reason', async () => {
      mockPrisma.referral.findUnique.mockResolvedValue(mockReferral);
      mockValidationService.checkScope.mockResolvedValue(true);

      await expect(
        service.updateWorkStatus(
          'ref-1',
          {
            workStatus: WorkStatus.BLOCKED_NEEDS_INFO,
            version: 1,
            reason: '', // Empty reason
          },
          mockUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw VersionConflictException if version mismatches', async () => {
      mockPrisma.referral.findUnique.mockResolvedValue(mockReferral); // version 1
      mockValidationService.checkScope.mockResolvedValue(true);

      await expect(
        service.updateWorkStatus(
          'ref-1',
          {
            workStatus: WorkStatus.IN_PROGRESS,
            version: 99,
          },
          mockUser,
        ),
      ).rejects.toThrow(VersionConflictException);
    });
  });

  // ============================================================================
  // assignReferral Tests (Task 9.3 & 9.4)
  // ============================================================================
  describe('assignReferral', () => {
    it('should assign referral to user when userId provided', async () => {
      mockPrisma.referral.findUnique.mockResolvedValue(mockReferral);
      mockValidationService.checkScope.mockResolvedValue(true);
      mockAssignmentService.assignToUser.mockResolvedValue(undefined);

      await service.assignReferral(
        'ref-1',
        {
          userId: 'user-2',
          reason: 'Workload distribution across team',
        },
        mockUser,
      );

      expect(mockAssignmentService.assignToUser).toHaveBeenCalledWith(
        'ref-1',
        'user-2',
        'Workload distribution across team',
        mockUser.userId,
      );
      expect(mockEventService.enqueueEvent).toHaveBeenCalledWith(
        'referral.assigned',
        'ref-1',
        expect.objectContaining({ assignedTo: 'user-2' }),
      );
    });

    it('should assign referral to role queue when role provided without userId', async () => {
      mockPrisma.referral.findUnique.mockResolvedValue(mockReferral);
      mockValidationService.checkScope.mockResolvedValue(true);
      mockAssignmentService.assignToRoleQueue.mockResolvedValue(undefined);

      await service.assignReferral(
        'ref-1',
        {
          role: UserRole.SCHEDULER,
          reason: 'Returned to scheduling role queue',
        },
        mockUser,
      );

      expect(mockAssignmentService.assignToRoleQueue).toHaveBeenCalledWith(
        'ref-1',
        UserRole.SCHEDULER,
        'Returned to scheduling role queue',
        mockUser.userId,
      );
    });

    it('should reject assignment if user lacks permission', async () => {
      mockPrisma.referral.findUnique.mockResolvedValue(mockReferral);
      const unauthorizedUser: AuthTokenPayload = {
        userId: 'billing-user-1',
        email: 'billing@heals.com',
        sessionId: 'session-2',
        iat: 1000000,
        exp: 2000000,
        roles: [UserRole.BILLING_COORDINATOR], // Not in allowed assigner roles
        scopes: mockUser.scopes,
      };

      await expect(
        service.assignReferral(
          'ref-1',
          { userId: 'user-2', reason: 'Attempted reassignment' },
          unauthorizedUser,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ============================================================================
  // getWorkflowHistory Tests (Task 9.5 & 9.6)
  // ============================================================================
  describe('getWorkflowHistory', () => {
    it('should return transitions in chronological order', async () => {
      mockPrisma.referral.findUnique.mockResolvedValue(mockReferral);
      mockValidationService.checkScope.mockResolvedValue(true);

      const transitions = [
        { id: 't1', transitionedAt: new Date('2026-01-01') },
        { id: 't2', transitionedAt: new Date('2026-01-02') },
      ];
      mockPrisma.workflowTransition.findMany.mockResolvedValue(transitions);

      const history = await service.getWorkflowHistory('ref-1', mockUser);

      expect(history).toEqual(transitions);
      expect(mockPrisma.workflowTransition.findMany).toHaveBeenCalledWith({
        where: { referralId: 'ref-1' },
        orderBy: { transitionedAt: 'asc' },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      });
    });

    it('should throw ForbiddenException if user lacks scope', async () => {
      mockPrisma.referral.findUnique.mockResolvedValue(mockReferral);
      mockValidationService.checkScope.mockResolvedValue(false);

      await expect(
        service.getWorkflowHistory('ref-1', mockUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should support pagination with take and skip', async () => {
      mockPrisma.referral.findUnique.mockResolvedValue(mockReferral);
      mockValidationService.checkScope.mockResolvedValue(true);
      mockPrisma.workflowTransition.findMany.mockResolvedValue([]);

      await service.getWorkflowHistory('ref-1', mockUser, { limit: 10, offset: 20 });

      expect(mockPrisma.workflowTransition.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
          skip: 20,
        }),
      );
    });
  });
});
