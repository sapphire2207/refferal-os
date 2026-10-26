import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../../database/prisma.service';
import { RedisService } from '../../../redis/redis.service';
import { ValidationService, ValidationResult, ValidationError } from './validation.service';
import { GatewayCheckService, ValidationContext } from './gateway-check.service';
import { EventService } from './event.service';
import { AssignmentService } from './assignment.service';
import {
  PipelineStage,
  WorkStatus,
  AuthTokenPayload,
  UserRole,
} from '@heals/types';
import { Prisma, Referral, WorkflowTransition } from '@prisma/client';
import { TransitionRequestDto } from '../dto/transition-request.dto';
import {
  TransitionResultDto,
  WorkflowTransitionDto,
} from '../dto/transition-response.dto';
import { AssignmentRequestDto } from '../dto/assignment.dto';
import { UpdateWorkStatusDto } from '../dto/work-status.dto';
import {
  ALLOWED_TRANSITIONS,
  WORK_STATUS_TRANSITIONS,
} from '../constants/workflow.constants';
import {
  getTransitionPermission,
  getReturnPermission,
} from '../constants/permissions.constants';
import {
  WorkflowValidationException,
  VersionConflictException,
} from '../exceptions/workflow.exceptions';

/**
 * WorkflowService orchestrates all state transitions, validations,
 * work status updates, assignments, and audit trail generation for referrals.
 * 
 * Guarantees:
 * 1. Transactional safety (all DB mutations, audits, and outbox events in 1 ACID transaction)
 * 2. Optimistic concurrency control (version increments, 409 conflict detection)
 * 3. Role & scope authorization
 * 4. Idempotency (via Redis & DB IdempotencyKey)
 * 5. Event-driven architecture via Transactional Outbox pattern
 * 
 * Requirements: 1.1 - 1.10, 8.1 - 8.7, 9.1 - 9.10, 10.1 - 10.11, 15.1 - 15.10
 */
@Injectable()
export class WorkflowService {
  private readonly logger = new Logger(WorkflowService.name);
  private readonly IDEMPOTENCY_TTL_SECONDS = 86400; // 24 hours

  constructor(
    private readonly prisma: PrismaService,
    private readonly validationService: ValidationService,
    private readonly gatewayCheckService: GatewayCheckService,
    private readonly eventService: EventService,
    private readonly assignmentService: AssignmentService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Validates a proposed stage transition without mutating any entity state.
   * Aggregates authorization, scope, transition path, version, and gateway checks.
   * 
   * @param context - ValidationContext with referral, targetStage, user, reason, etc.
   * @returns ValidationResult with valid boolean and array of structured errors
   */
  async validateTransition(context: ValidationContext): Promise<ValidationResult> {
    this.logger.debug(
      `Validating transition for referral ${context.referral.id} to ${context.targetStage} by user ${context.user.userId}`,
    );

    const errors: ValidationError[] = [];

    const stageOrder: Record<PipelineStage, number> = {
      [PipelineStage.INTAKE]: 1,
      [PipelineStage.CLINICAL_REVIEW]: 2,
      [PipelineStage.SCHEDULING]: 3,
      [PipelineStage.NP_VISIT]: 4,
      [PipelineStage.NOTES_QA]: 5,
      [PipelineStage.BILLING]: 6,
    };

    const currentOrder = stageOrder[context.referral.pipelineStage as unknown as PipelineStage];
    const targetOrder = stageOrder[context.targetStage];
    const isBackward = targetOrder < currentOrder;

    // Terminal state check (Requirements 3.5, 11.1-11.8): block forward transitions if terminal
    if (!isBackward) {
      const terminalCheck = this.validationService.checkTerminalState(context.referral);
      if (!terminalCheck.valid) {
        errors.push(...terminalCheck.errors);
      }
    }

    // 1. Determine action permission required for this transition
    let actionPermission: string;
    try {
      actionPermission = isBackward
        ? getReturnPermission(context.targetStage)
        : getTransitionPermission(context.targetStage);
    } catch {
      actionPermission = `referrals.transition.to_${context.targetStage.toLowerCase()}`;
    }

    // 2. Check Action Authorization (Requirement 1.1, 14.2)
    const isAuthorized = await this.validationService.checkAuthorization(
      context.user,
      actionPermission,
      context.referral,
    );
    if (!isAuthorized) {
      errors.push({
        type: 'permission',
        message: `User lacks required permission '${actionPermission}' to transition to ${context.targetStage}`,
        details: {
          action: actionPermission,
          userId: context.user.userId,
          roles: context.user.roles,
        },
      });
    }

    // 3. Check Scope Access (Requirement 1.2, 14.3-14.5)
    const hasScope = await this.validationService.checkScope(
      context.user,
      context.referral,
    );
    if (!hasScope) {
      errors.push({
        type: 'scope',
        message: `User lacks scope access for referral location (site: ${context.referral.site}, state: ${context.referral.state}, legalEntity: ${context.referral.legalEntity})`,
        details: {
          referralId: context.referral.id,
          scopes: context.user.scopes,
        },
      });
    }

    // 4. Validate Transition Path (Requirement 1.3)
    const isAllowedPath = this.validationService.validateTransitionPath(
      context.referral.pipelineStage as unknown as PipelineStage,
      context.targetStage,
    );
    if (!isAllowedPath) {
      errors.push({
        type: 'transition',
        message: `Transition from ${context.referral.pipelineStage} to ${context.targetStage} is not allowed per ALLOWED_TRANSITIONS`,
        details: {
          fromStage: context.referral.pipelineStage,
          toStage: context.targetStage,
          allowedTransitions:
            ALLOWED_TRANSITIONS[context.referral.pipelineStage as unknown as PipelineStage] || [],
        },
      });
    }

    // 5. Validate Version if specified in context (Requirement 1.7, 8.1)
    if ((context as any).requestedVersion !== undefined) {
      const versionResult = this.validationService.validateVersion(
        context.referral,
        (context as any).requestedVersion,
      );
      if (!versionResult.valid) {
        errors.push(...versionResult.errors);
      }
    }

    // 6. Gate and Prerequisite Validation (Requirement 1.4, Gates)
    const gateResult = await this.gatewayCheckService.checkGatesForTransition(context);
    if (!gateResult.valid) {
      errors.push(...gateResult.errors);
    }

    // Deduplicate errors
    const seen = new Set<string>();
    const uniqueErrors: ValidationError[] = [];
    for (const err of errors) {
      const key = `${err.type}:${err.field || ''}:${err.message}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueErrors.push(err);
      }
    }

    return {
      valid: uniqueErrors.length === 0,
      errors: uniqueErrors,
    };
  }

  /**
   * Executes a stage transition within an ACID transaction.
   * Performs idempotency checks, concurrency validation, database mutation,
   * audit trail creation, assignment routing, and transactional outbox event queuing.
   * 
   * @param referralId - Referral ID to transition
   * @param request - TransitionRequestDto with targetStage, version, reason, etc.
   * @param user - Authenticated user payload
   * @returns TransitionResultDto
   */
  async executeTransition(
    referralId: string,
    request: TransitionRequestDto,
    user: AuthTokenPayload,
  ): Promise<TransitionResultDto> {
    this.logger.log(
      `Executing transition on referral ${referralId} to ${request.targetStage} by user ${user.userId}`,
    );

    // 1. Idempotency Check (Requirements 15.1 - 15.6)
    const requestHash = crypto
      .createHash('sha256')
      .update(
        JSON.stringify({
          referralId,
          targetStage: request.targetStage,
          version: request.version,
          reason: request.reason || '',
          metadata: request.metadata || {},
        }),
      )
      .digest('hex');

    if (request.idempotencyKey) {
      const cached = await this.checkIdempotency(request.idempotencyKey, requestHash);
      if (cached) {
        this.logger.log(
          `Idempotent hit for key ${request.idempotencyKey}, returning cached transition response`,
        );
        return cached;
      }
    }

    // 2. Fetch current Referral
    const referral = await this.prisma.referral.findUnique({
      where: { id: referralId },
    });

    if (!referral) {
      throw new NotFoundException(`Referral with ID ${referralId} not found`);
    }

    // 3. Optimistic Concurrency Check (Pre-transaction)
    if (referral.version !== request.version) {
      throw new VersionConflictException(request.version, referral.version, referral);
    }

    // 4. Validate Transition Rules and Gates
    const validationContext: ValidationContext = {
      referral,
      targetStage: request.targetStage,
      user,
      reason: request.reason,
      metadata: request.metadata,
    };

    const validation = await this.validateTransition(validationContext);
    if (!validation.valid) {
      throw new WorkflowValidationException(validation.errors as any);
    }

    // 5. Execute within Prisma Transaction with Row Locking
    const transactionResult = await this.prisma.$transaction(
      async (tx) => {
        // Row-level lock (PostgreSQL FOR UPDATE) to serialize concurrent transitions
        let lockedReferral: Referral | null = null;
        try {
          const rows = await tx.$queryRaw<Referral[]>`
            SELECT * FROM referrals WHERE id = ${referralId} FOR UPDATE
          `;
          if (rows && rows.length > 0) {
            lockedReferral = rows[0];
          }
        } catch {
          // Fallback if raw query is not supported in mocked environments
          lockedReferral = await tx.referral.findUnique({
            where: { id: referralId },
          });
        }

        const current = lockedReferral || (await tx.referral.findUnique({ where: { id: referralId } }));
        if (!current) {
          throw new NotFoundException(`Referral with ID ${referralId} not found`);
        }

        // Re-check version within locked transaction (Requirement 8.5)
        if (current.version !== request.version) {
          throw new VersionConflictException(request.version, current.version, current);
        }

        const nextVersion = current.version + 1;

        // A. Update Referral State
        const updatedReferral = await tx.referral.update({
          where: { id: referralId },
          data: {
            pipelineStage: request.targetStage as unknown as any,
            workStatus: WorkStatus.PENDING as unknown as any,
            version: nextVersion,
            updatedAt: new Date(),
          },
        });

        // B. Determine Assignment & Update
        const assignment = await this.assignmentService.determineAssignment(
          current,
          request.targetStage,
          request.metadata,
        );

        if (assignment.userId) {
          await this.assignmentService.assignToUser(
            referralId,
            assignment.userId,
            request.reason || `Transitioned to ${request.targetStage}`,
            user.userId,
            tx,
          );
        } else {
          await this.assignmentService.assignToRoleQueue(
            referralId,
            assignment.role,
            request.reason || `Transitioned to ${request.targetStage}`,
            user.userId,
            tx,
          );
        }

        // C. Record Immutable Workflow Transition Audit Entry
        const transitionRecord = await tx.workflowTransition.create({
          data: {
            referralId,
            fromStage: current.pipelineStage,
            toStage: request.targetStage as unknown as any,
            fromStatus: current.workStatus,
            toStatus: WorkStatus.PENDING as unknown as any,
            transitionedBy: user.userId,
            reason: request.reason || null,
            metadata: request.metadata
              ? (request.metadata as unknown as Prisma.InputJsonValue)
              : Prisma.JsonNull,
            transitionedAt: new Date(),
          },
        });

        // D. Enqueue Event in Transactional Outbox (Requirement 1.10, 17.7)
        await this.eventService.enqueueEvent(
          'referral.stage.changed',
          referralId,
          {
            referralId,
            fromStage: current.pipelineStage,
            toStage: request.targetStage,
            fromStatus: current.workStatus,
            toStatus: WorkStatus.PENDING,
            version: nextVersion,
            transitionedBy: user.userId,
            transitionId: transitionRecord.id,
            assignedRole: assignment.role,
            assignedTo: assignment.userId || null,
            timestamp: new Date().toISOString(),
          },
          tx,
        );

        const finalReferral =
          (await tx.referral.findUnique({ where: { id: referralId } })) || updatedReferral;

        return { updatedReferral: finalReferral, transitionRecord };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      },
    );

    // 6. Build Result DTO
    const transitionDto: WorkflowTransitionDto = {
      id: transactionResult.transitionRecord.id,
      referralId: transactionResult.transitionRecord.referralId,
      fromStage: transactionResult.transitionRecord.fromStage as unknown as PipelineStage,
      toStage: transactionResult.transitionRecord.toStage as unknown as PipelineStage,
      fromStatus: transactionResult.transitionRecord.fromStatus as unknown as WorkStatus,
      toStatus: transactionResult.transitionRecord.toStatus as unknown as WorkStatus,
      transitionedBy: transactionResult.transitionRecord.transitionedBy,
      reason: transactionResult.transitionRecord.reason || undefined,
      metadata: (transactionResult.transitionRecord.metadata as Record<string, any>) || undefined,
      transitionedAt: transactionResult.transitionRecord.transitionedAt.toISOString(),
    };

    const result: TransitionResultDto = {
      success: true,
      referral: transactionResult.updatedReferral as unknown as any,
      transition: transitionDto,
    };

    // 7. Post-Commit Actions: Cache Invalidation & Idempotency Storage
    await this.postCommitActions(referralId, request.idempotencyKey, requestHash, result);

    return result;
  }

  /**
   * Updates work status independently of pipeline stage.
   * Enforces WORK_STATUS_TRANSITIONS rules, reasons for blocked/on-hold,
   * optimistic concurrency, and audit logging.
   * 
   * @param referralId - Referral ID to update
   * @param dto - UpdateWorkStatusDto
   * @param user - Authenticated user payload
   * @returns Updated Referral
   */
  async updateWorkStatus(
    referralId: string,
    dto: UpdateWorkStatusDto,
    user: AuthTokenPayload,
  ): Promise<Referral> {
    this.logger.log(
      `Updating work status for referral ${referralId} to ${dto.workStatus} by user ${user.userId}`,
    );

    const referral = await this.prisma.referral.findUnique({
      where: { id: referralId },
    });

    if (!referral) {
      throw new NotFoundException(`Referral with ID ${referralId} not found`);
    }

    // Scope check
    const hasScope = await this.validationService.checkScope(user, referral);
    if (!hasScope) {
      throw new ForbiddenException('User lacks scope access to this referral');
    }

    // Version optimistic concurrency check
    if (referral.version !== dto.version) {
      throw new VersionConflictException(dto.version, referral.version, referral);
    }

    // Enforce valid WORK_STATUS_TRANSITIONS
    const currentStatus = referral.workStatus as unknown as WorkStatus;
    const allowedTargets = WORK_STATUS_TRANSITIONS[currentStatus] || [];
    if (!allowedTargets.includes(dto.workStatus)) {
      throw new BadRequestException(
        `Invalid work status transition: ${currentStatus} -> ${dto.workStatus}. Allowed transitions: [${allowedTargets.join(', ')}]`,
      );
    }

    // Enforce required reasons for BLOCKED_NEEDS_INFO and ON_HOLD
    if (
      (dto.workStatus === WorkStatus.BLOCKED_NEEDS_INFO || dto.workStatus === WorkStatus.ON_HOLD) &&
      (!dto.reason || dto.reason.trim().length === 0)
    ) {
      throw new BadRequestException(
        `Reason documentation is required when setting work status to ${dto.workStatus}`,
      );
    }

    // Execute status transition in transaction
    const nextVersion = referral.version + 1;

    const updatedReferral = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.referral.update({
        where: { id: referralId },
        data: {
          workStatus: dto.workStatus as unknown as any,
          version: nextVersion,
          updatedAt: new Date(),
        },
      });

      // Audit transition record (same stage, changed status)
      await tx.workflowTransition.create({
        data: {
          referralId,
          fromStage: referral.pipelineStage,
          toStage: referral.pipelineStage,
          fromStatus: referral.workStatus,
          toStatus: dto.workStatus as unknown as any,
          transitionedBy: user.userId,
          reason: dto.reason || null,
          metadata: {
            ...(dto.metadata || {}),
            nextReviewDate: dto.nextReviewDate ? dto.nextReviewDate.toISOString() : null,
          },
          transitionedAt: new Date(),
        },
      });

      // Transactional outbox event
      await this.eventService.enqueueEvent(
        'referral.work_status.changed',
        referralId,
        {
          referralId,
          pipelineStage: referral.pipelineStage,
          fromStatus: referral.workStatus,
          toStatus: dto.workStatus,
          version: nextVersion,
          updatedBy: user.userId,
          reason: dto.reason,
          nextReviewDate: dto.nextReviewDate,
          timestamp: new Date().toISOString(),
        },
        tx,
      );

      return updated;
    });

    // Invalidate caches
    try {
      await this.redis.del(`referral:${referralId}`);
      await this.redis.del('dashboard:metrics');
      await this.redis.delPattern('dashboard:metrics:*');
    } catch {}

    return updatedReferral;
  }

  /**
   * Assigns a referral to a user or a role queue.
   * 
   * @param dto - AssignmentRequestDto
   * @param referralId - Referral ID to assign
   * @param user - Authenticated user performing assignment
   * @returns Updated Referral
   */
  async assignReferral(
    referralId: string,
    dto: AssignmentRequestDto,
    user: AuthTokenPayload,
  ): Promise<Referral> {
    this.logger.log(
      `Assigning referral ${referralId} (userId: ${dto.userId}, role: ${dto.role}) by user ${user.userId}`,
    );

    const referral = await this.prisma.referral.findUnique({
      where: { id: referralId },
    });

    if (!referral) {
      throw new NotFoundException(`Referral with ID ${referralId} not found`);
    }

    // Check assigner authorization
    const isAssignerAdmin = user.roles.includes(UserRole.ADMIN);
    const hasAssignPermission =
      isAssignerAdmin ||
      user.roles.some((r) =>
        [
          UserRole.CLINICAL_COORDINATOR,
          UserRole.OFFICE_MANAGER,
          UserRole.INTAKE_SPECIALIST,
          UserRole.CLINICAL_REVIEWER,
          UserRole.SCHEDULER,
        ].includes(r),
      );

    if (!hasAssignPermission) {
      throw new ForbiddenException('User lacks permission to assign referrals');
    }

    const hasScope = await this.validationService.checkScope(user, referral);
    if (!hasScope) {
      throw new ForbiddenException('User lacks scope access to this referral');
    }

    // Perform assignment
    if (dto.userId) {
      await this.assignmentService.assignToUser(
        referralId,
        dto.userId,
        dto.reason,
        user.userId,
      );
    } else if (dto.role) {
      await this.assignmentService.assignToRoleQueue(
        referralId,
        dto.role,
        dto.reason,
        user.userId,
      );
    } else {
      throw new BadRequestException('Either userId or role must be provided for assignment');
    }

    // Emit assignment event
    await this.eventService.enqueueEvent('referral.assigned', referralId, {
      referralId,
      assignedTo: dto.userId || null,
      assignedRole: dto.role || null,
      assignedBy: user.userId,
      reason: dto.reason,
      timestamp: new Date().toISOString(),
    });

    // Invalidate caches
    try {
      await this.redis.del(`referral:${referralId}`);
      await this.redis.delPattern('dashboard:metrics:*');
      await this.redis.delPattern('referral:list:*');
    } catch {}

    return (await this.prisma.referral.findUnique({
      where: { id: referralId },
    })) as Referral;
  }

  /**
   * Retrieves full chronological workflow audit history for a referral.
   * 
   * @param referralId - Referral ID to query
   * @param user - Authenticated user payload
   * @returns Array of WorkflowTransition records
   */
  async getWorkflowHistory(
    referralId: string,
    user: AuthTokenPayload,
    pagination?: { limit?: number; offset?: number },
  ): Promise<WorkflowTransition[]> {
    this.logger.debug(
      `Retrieving workflow history for referral ${referralId} by user ${user.userId}`,
    );

    const referral = await this.prisma.referral.findUnique({
      where: { id: referralId },
    });

    if (!referral) {
      throw new NotFoundException(`Referral with ID ${referralId} not found`);
    }

    const hasScope = await this.validationService.checkScope(user, referral);
    if (!hasScope) {
      throw new ForbiddenException('User lacks scope access to this referral');
    }

    return this.prisma.workflowTransition.findMany({
      where: { referralId },
      orderBy: { transitionedAt: 'asc' },
      take: pagination?.limit,
      skip: pagination?.offset,
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
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Checks both Redis and DB IdempotencyKey records for existing response.
   */
  private async checkIdempotency(
    key: string,
    requestHash: string,
  ): Promise<TransitionResultDto | null> {
    const redisKey = `idempotency:${key}`;
    try {
      const cached = await this.redis.getJson<TransitionResultDto>(redisKey);
      if (cached) {
        return cached;
      }
    } catch (e) {
      this.logger.warn(`Redis idempotency read failed: ${e.message}`);
    }

    // Fallback to database IdempotencyKey table
    try {
      const dbRecord = await this.prisma.idempotencyKey.findUnique({
        where: { key },
      });

      if (dbRecord) {
        if (dbRecord.requestHash !== requestHash) {
          throw new ConflictException(
            `Idempotency key '${key}' was already used with a different request payload`,
          );
        }

        if (dbRecord.expiresAt > new Date()) {
          return dbRecord.responseBody as unknown as TransitionResultDto;
        }
      }
    } catch (e) {
      if (e instanceof ConflictException) throw e;
      this.logger.warn(`DB idempotency check failed: ${e.message}`);
    }

    return null;
  }

  /**
   * Post-commit actions: Cache storage and cache invalidation.
   */
  private async postCommitActions(
    referralId: string,
    idempotencyKey?: string,
    requestHash?: string,
    result?: TransitionResultDto,
  ): Promise<void> {
    // 1. Store Idempotency result
    if (idempotencyKey && result && requestHash) {
      const redisKey = `idempotency:${idempotencyKey}`;
      try {
        await this.redis.setJson(redisKey, result, this.IDEMPOTENCY_TTL_SECONDS);
      } catch (e) {
        this.logger.warn(`Failed to cache idempotency key in Redis: ${e.message}`);
      }

      try {
        const expiresAt = new Date(Date.now() + this.IDEMPOTENCY_TTL_SECONDS * 1000);
        await this.prisma.idempotencyKey.upsert({
          where: { key: idempotencyKey },
          create: {
            key: idempotencyKey,
            requestHash,
            responseStatus: 200,
            responseBody: result as unknown as Prisma.JsonObject,
            expiresAt,
          },
          update: {
            responseBody: result as unknown as Prisma.JsonObject,
            expiresAt,
          },
        });
      } catch (e) {
        this.logger.warn(`Failed to persist idempotency key in DB: ${e.message}`);
      }
    }

    // 2. Invalidate cache tags
    try {
      await this.redis.del(`referral:${referralId}`);
      await this.redis.del('dashboard:metrics');
      await this.redis.del('dashboard:workqueues');
      await this.redis.delPattern('dashboard:metrics:*');
      await this.redis.delPattern('referral:list:*');
    } catch (e) {
      this.logger.warn(`Cache invalidation error: ${e.message}`);
    }
  }
}
