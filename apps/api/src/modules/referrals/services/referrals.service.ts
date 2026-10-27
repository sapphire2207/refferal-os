import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { RedisService } from '../../../redis/redis.service';
import { ValidationService } from './validation.service';
import { EventService } from './event.service';
import {
  CreateReferralDto,
  UpdateReferralDto,
  QueryReferralsDto,
} from '../dto/referral-crud.dto';
import {
  AuthTokenPayload,
  UserRole,
  PipelineStage,
  WorkStatus,
  DashboardMetrics,
} from '@heals/types';
import { Referral, Prisma } from '@prisma/client';
import { VersionConflictException } from '../exceptions/workflow.exceptions';

@Injectable()
export class ReferralsService {
  private readonly logger = new Logger(ReferralsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly validationService: ValidationService,
    private readonly eventService: EventService,
  ) {}

  /**
   * Creates a new referral in the INTAKE stage.
   * Validates user scope access for the assigned location attributes.
   * 
   * @param dto - CreateReferralDto
   * @param user - Authenticated user payload
   * @returns Created Referral
   */
  async create(dto: CreateReferralDto, user: AuthTokenPayload): Promise<Referral> {
    this.logger.log(`Creating referral for patient ${dto.patientId} by user ${user.userId}`);

    const isAdmin = user.roles.includes(UserRole.ADMIN);

    // Validate scope if specified
    if (!isAdmin) {
      if (dto.site && !user.scopes.sites.includes(dto.site)) {
        throw new ForbiddenException(`User lacks scope for site ${dto.site}`);
      }
      if (dto.state && !user.scopes.states.includes(dto.state)) {
        throw new ForbiddenException(`User lacks scope for state ${dto.state}`);
      }
      if (dto.legalEntity && !user.scopes.legalEntities.includes(dto.legalEntity)) {
        throw new ForbiddenException(`User lacks scope for legal entity ${dto.legalEntity}`);
      }
    }

    // Verify patient exists
    const patient = await this.prisma.patient.findUnique({
      where: { id: dto.patientId },
    });
    if (!patient) {
      throw new NotFoundException(`Patient with ID ${dto.patientId} not found`);
    }

    const referral = await this.prisma.referral.create({
      data: {
        patientId: dto.patientId,
        pipelineStage: PipelineStage.INTAKE as unknown as any,
        workStatus: WorkStatus.PENDING as unknown as any,
        version: 1,
        referralSource: dto.referralSource,
        referringProvider: dto.referringProvider,
        referringProviderNpi: dto.referringProviderNpi,
        referringFacility: dto.referringFacility,
        insurancePayer: dto.insurancePayer,
        insuranceMemberId: dto.insuranceMemberId,
        insuranceGroupNumber: dto.insuranceGroupNumber,
        coverageVerified: dto.coverageVerified ?? false,
        coverageVerificationDate: dto.coverageVerificationDate,
        coverageNotes: dto.coverageNotes,
        site: dto.site,
        state: dto.state,
        legalEntity: dto.legalEntity,
        priority: dto.priority || 'ROUTINE',
        assignedTo: dto.assignedTo,
        assignedRole: (dto.assignedRole as unknown as any) || (dto.assignedTo ? 'INTAKE_SPECIALIST' : null),
      },
    });

    // Enqueue creation event
    await this.eventService.enqueueEvent('referral.created', referral.id, {
      referralId: referral.id,
      patientId: referral.patientId,
      createdBy: user.userId,
      site: referral.site,
      state: referral.state,
      timestamp: new Date().toISOString(),
    });

    // Invalidate dashboard caches and referral lists
    try {
      await this.redis.del('dashboard:metrics');
      await this.redis.del('dashboard:workqueues');
      await this.redis.delPattern('dashboard:metrics:*');
      await this.redis.delPattern('referral:list:*');
    } catch {}

    return referral;
  }

  /**
   * Retrieves a single referral by ID with relations.
   * Enforces scope-based authorization.
   * 
   * @param id - Referral ID
   * @param user - Authenticated user payload
   * @returns Referral entity with related patient
   */
  async findOne(id: string, user: AuthTokenPayload): Promise<Referral> {
    this.logger.debug(`Retrieving referral ${id} by user ${user.userId}`);

    const referral = await this.prisma.referral.findUnique({
      where: { id },
      include: {
        patient: true,
        assignments: {
          orderBy: { assignedAt: 'desc' },
          take: 5,
        },
      },
    });

    if (!referral) {
      throw new NotFoundException(`Referral with ID ${id} not found`);
    }

    const hasScope = await this.validationService.checkScope(user, referral);
    if (!hasScope) {
      // Per Requirement 14 & Task 11.4: hide existence or deny access with 404
      throw new NotFoundException(`Referral with ID ${id} not found`);
    }

    return referral;
  }

  /**
   * Retrieves paginated referrals matching filters and restricted to user scopes.
   * 
   * @param query - QueryReferralsDto
   * @param user - Authenticated user payload
   * @returns Paginated results with total count
   */
  async findMany(
    query: QueryReferralsDto,
    user: AuthTokenPayload,
  ): Promise<{ data: Referral[]; total: number; limit: number; offset: number }> {
    const isAdmin = user.roles.includes(UserRole.ADMIN);
    const where: Prisma.ReferralWhereInput = {};

    // 1. Apply Scope Constraints for non-admins
    if (!isAdmin) {
      if (user.scopes.sites && user.scopes.sites.length > 0) {
        where.site = { in: user.scopes.sites };
      }
      if (user.scopes.states && user.scopes.states.length > 0) {
        where.state = { in: user.scopes.states };
      }
      if (user.scopes.legalEntities && user.scopes.legalEntities.length > 0) {
        where.legalEntity = { in: user.scopes.legalEntities };
      }
    }

    // 2. Apply Explicit Filter Overrides (within scope)
    if (query.pipelineStage) {
      where.pipelineStage = query.pipelineStage as unknown as any;
    }
    if (query.workStatus) {
      where.workStatus = query.workStatus as unknown as any;
    }
    if (query.caseOutcome) {
      where.caseOutcome = query.caseOutcome as unknown as any;
    }
    if (query.billingStatus) {
      where.billingStatus = query.billingStatus as unknown as any;
    }
    if (query.priority) {
      where.priority = query.priority;
    }
    if (query.site) {
      where.site = query.site;
    }
    if (query.state) {
      where.state = query.state;
    }
    if (query.legalEntity) {
      where.legalEntity = query.legalEntity;
    }
    if (query.assignedTo) {
      where.assignedTo = query.assignedTo;
    }
    if (query.assignedRole) {
      where.assignedRole = query.assignedRole as unknown as any;
    }
    if (query.patientId) {
      where.patientId = query.patientId;
    }

    // 3. Search filter
    if (query.search) {
      where.OR = [
        { insuranceMemberId: { contains: query.search, mode: 'insensitive' } },
        { referringProvider: { contains: query.search, mode: 'insensitive' } },
        { patient: { firstName: { contains: query.search, mode: 'insensitive' } } },
        { patient: { lastName: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;

    const [data, total] = await Promise.all([
      this.prisma.referral.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { createdAt: 'desc' },
        include: {
          patient: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              dateOfBirth: true,
              medicalRecordNumber: true,
              phone: true,
            },
          },
        },
      }),
      this.prisma.referral.count({ where }),
    ]);

    return {
      data,
      total,
      limit,
      offset,
    };
  }

  /**
   * Updates non-workflow referral fields with optimistic concurrency control.
   * 
   * @param id - Referral ID
   * @param dto - UpdateReferralDto
   * @param user - Authenticated user payload
   * @returns Updated Referral
   */
  async update(
    id: string,
    dto: UpdateReferralDto,
    user: AuthTokenPayload,
  ): Promise<Referral> {
    this.logger.log(`Updating referral ${id} by user ${user.userId}`);

    const referral = await this.prisma.referral.findUnique({
      where: { id },
    });

    if (!referral) {
      throw new NotFoundException(`Referral with ID ${id} not found`);
    }

    const hasScope = await this.validationService.checkScope(user, referral);
    if (!hasScope) {
      throw new ForbiddenException('User lacks scope access to this referral');
    }

    // Optimistic concurrency check (Requirement 8.1, 8.8)
    if (referral.version !== dto.version) {
      throw new VersionConflictException(dto.version, referral.version, referral);
    }

    const nextVersion = referral.version + 1;

    const updated = await this.prisma.referral.update({
      where: { id },
      data: {
        referralSource: dto.referralSource !== undefined ? dto.referralSource : referral.referralSource,
        referringProvider: dto.referringProvider !== undefined ? dto.referringProvider : referral.referringProvider,
        referringProviderNpi: dto.referringProviderNpi !== undefined ? dto.referringProviderNpi : referral.referringProviderNpi,
        referringFacility: dto.referringFacility !== undefined ? dto.referringFacility : referral.referringFacility,
        insurancePayer: dto.insurancePayer !== undefined ? dto.insurancePayer : referral.insurancePayer,
        insuranceMemberId: dto.insuranceMemberId !== undefined ? dto.insuranceMemberId : referral.insuranceMemberId,
        insuranceGroupNumber: dto.insuranceGroupNumber !== undefined ? dto.insuranceGroupNumber : referral.insuranceGroupNumber,
        coverageVerified: dto.coverageVerified !== undefined ? dto.coverageVerified : referral.coverageVerified,
        coverageVerificationDate: dto.coverageVerificationDate !== undefined ? dto.coverageVerificationDate : referral.coverageVerificationDate,
        coverageNotes: dto.coverageNotes !== undefined ? dto.coverageNotes : referral.coverageNotes,
        site: dto.site !== undefined ? dto.site : referral.site,
        state: dto.state !== undefined ? dto.state : referral.state,
        legalEntity: dto.legalEntity !== undefined ? dto.legalEntity : referral.legalEntity,
        priority: dto.priority !== undefined ? dto.priority : referral.priority,
        assignedTo: dto.assignedTo !== undefined ? dto.assignedTo : referral.assignedTo,
        assignedRole: dto.assignedRole !== undefined ? (dto.assignedRole as unknown as any) : referral.assignedRole,
        version: nextVersion,
        updatedAt: new Date(),
      },
    });

    // Invalidate caches
    try {
      await this.redis.del(`referral:${id}`);
      await this.redis.delPattern('dashboard:metrics:*');
      await this.redis.delPattern('referral:list:*');
    } catch {}

    return updated;
  }

  /**
   * Computes or fetches cached dashboard metrics filtered by user scope.
   * Cached in Redis with 1-minute TTL at key dashboard:metrics:{userId}.
   * 
   * @param user - Authenticated user payload
   * @returns DashboardMetrics
   * 
   * @see Requirement 16.4, 16.7
   */
  async getDashboardMetrics(user: AuthTokenPayload): Promise<DashboardMetrics> {
    const cacheKey = `dashboard:metrics:${user.userId}`;
    try {
      const cached = await this.redis.getJson<DashboardMetrics>(cacheKey);
      if (cached) {
        this.logger.debug(`Cache hit for dashboard metrics: ${cacheKey}`);
        return cached;
      }
    } catch (e) {
      this.logger.warn(`Redis getJson failed for dashboard metrics: ${e.message}`);
    }

    const isAdmin = user.roles.includes(UserRole.ADMIN);
    const where: Prisma.ReferralWhereInput = {};
    if (!isAdmin) {
      if (user.scopes.sites && user.scopes.sites.length > 0) {
        where.site = { in: user.scopes.sites };
      }
      if (user.scopes.states && user.scopes.states.length > 0) {
        where.state = { in: user.scopes.states };
      }
      if (user.scopes.legalEntities && user.scopes.legalEntities.length > 0) {
        where.legalEntity = { in: user.scopes.legalEntities };
      }
    }

    // Initialize counts for all stages
    const byStage: Record<PipelineStage, number> = {
      [PipelineStage.INTAKE]: 0,
      [PipelineStage.CLINICAL_REVIEW]: 0,
      [PipelineStage.SCHEDULING]: 0,
      [PipelineStage.NP_VISIT]: 0,
      [PipelineStage.NOTES_QA]: 0,
      [PipelineStage.BILLING]: 0,
    };

    // Initialize counts for all statuses
    const byStatus: Record<WorkStatus, number> = {
      [WorkStatus.PENDING]: 0,
      [WorkStatus.IN_PROGRESS]: 0,
      [WorkStatus.BLOCKED_NEEDS_INFO]: 0,
      [WorkStatus.ON_HOLD]: 0,
      [WorkStatus.COMPLETED]: 0,
    };

    const stageGroups = await this.prisma.referral.groupBy({
      by: ['pipelineStage'],
      where,
      _count: true,
    });

    for (const group of stageGroups) {
      const stage = group.pipelineStage as unknown as PipelineStage;
      if (byStage[stage] !== undefined) {
        byStage[stage] = group._count;
      }
    }

    const statusGroups = await this.prisma.referral.groupBy({
      by: ['workStatus'],
      where,
      _count: true,
    });

    for (const group of statusGroups) {
      const status = group.workStatus as unknown as WorkStatus;
      if (byStatus[status] !== undefined) {
        byStatus[status] = group._count;
      }
    }

    const totalActive = Object.entries(byStatus).reduce((acc, [status, count]) => {
      if (status !== WorkStatus.COMPLETED) {
        return acc + count;
      }
      return acc;
    }, 0);

    const metrics: DashboardMetrics = {
      totalActive,
      byStage,
      byStatus,
      overdue: 0,
      dueToday: 0,
    };

    try {
      await this.redis.setJson(cacheKey, metrics, 60); // 1-minute TTL
      this.logger.debug(`Cached dashboard metrics for user ${user.userId}`);
    } catch (e) {
      this.logger.warn(`Failed to cache dashboard metrics in Redis: ${e.message}`);
    }

    return metrics;
  }
}
