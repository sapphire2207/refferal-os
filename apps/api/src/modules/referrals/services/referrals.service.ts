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
import { AuditService } from '../../audit/audit.service';
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
    private readonly auditService: AuditService,
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
      const allowedSites = user.scopes?.sites || [];
      const allowedStates = user.scopes?.states || [];
      const allowedEntities = user.scopes?.legalEntities || [];
      const hasAllSites = allowedSites.includes('ALL') || allowedSites.includes('*');
      const hasAllStates = allowedStates.includes('ALL') || allowedStates.includes('*');
      const hasAllEntities = allowedEntities.includes('ALL') || allowedEntities.includes('*');

      if (dto.site && !hasAllSites && allowedSites.length > 0 && !allowedSites.includes(dto.site)) {
        throw new ForbiddenException(`User lacks scope for site ${dto.site}`);
      }
      if (dto.state && !hasAllStates && allowedStates.length > 0 && !allowedStates.includes(dto.state)) {
        throw new ForbiddenException(`User lacks scope for state ${dto.state}`);
      }
      if (dto.legalEntity && !hasAllEntities && allowedEntities.length > 0 && !allowedEntities.includes(dto.legalEntity)) {
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

    // Resolve location defaults from user scope if not explicitly provided in DTO
    const firstAllowedSite = user.scopes?.sites?.find((s) => s !== 'ALL' && s !== '*');
    const firstAllowedState = user.scopes?.states?.find((s) => s !== 'ALL' && s !== '*');
    const firstAllowedEntity = user.scopes?.legalEntities?.find((e) => e !== 'ALL' && e !== '*');

    const resolvedSite = dto.site || firstAllowedSite || 'Site-A';
    const resolvedState = dto.state || firstAllowedState || 'CA';
    const resolvedLegalEntity = dto.legalEntity || firstAllowedEntity || 'legal-entity-1';

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
        site: resolvedSite,
        state: resolvedState,
        legalEntity: resolvedLegalEntity,
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

    // Log PHI access for individual referral
    if (referral.patient) {
      await this.auditService.logPhiAccess(
        user.userId,
        'REFERRAL',
        referral.id,
        `Referral details viewed for patient ${referral.patient.id}`,
      );
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
    const isAdmin = user.roles.some((r) => r === UserRole.ADMIN || r === UserRole.COMPLIANCE);
    const where: Prisma.ReferralWhereInput = {};

    // 1. Apply Scope Constraints for non-admins (Fail Closed)
    if (!isAdmin) {
      const allowedSites = user.scopes?.sites || [];
      const allowedStates = user.scopes?.states || [];
      const allowedEntities = user.scopes?.legalEntities || [];
      const hasAllSites = allowedSites.includes('ALL') || allowedSites.includes('*');
      const hasAllStates = allowedStates.includes('ALL') || allowedStates.includes('*');
      const hasAllEntities = allowedEntities.includes('ALL') || allowedEntities.includes('*');

      const isUnrestricted = hasAllSites || hasAllStates;
      const hasAnyScope =
        isUnrestricted ||
        allowedSites.length > 0 ||
        allowedStates.length > 0 ||
        allowedEntities.length > 0;

      if (!hasAnyScope) {
        return { data: [], total: 0, limit: query.limit ?? 20, offset: query.offset ?? 0 };
      }

      if (query.site) {
        if (!hasAllSites && allowedSites.length > 0) {
          if (!allowedSites.includes(query.site)) {
            return { data: [], total: 0, limit: query.limit ?? 20, offset: query.offset ?? 0 };
          }
          where.site = query.site;
        } else {
          where.site = query.site;
        }
      } else if (!hasAllSites && allowedSites.length > 0) {
        where.OR = [
          { site: { in: allowedSites } },
          { site: null },
        ];
      }

      if (query.state) {
        if (!hasAllStates && allowedStates.length > 0) {
          if (!allowedStates.includes(query.state)) {
            return { data: [], total: 0, limit: query.limit ?? 20, offset: query.offset ?? 0 };
          }
          where.state = query.state;
        } else {
          where.state = query.state;
        }
      } else if (!hasAllStates && allowedStates.length > 0) {
        where.state = { in: allowedStates };
      }

      if (query.legalEntity) {
        if (!hasAllEntities && allowedEntities.length > 0) {
          if (!allowedEntities.includes(query.legalEntity)) {
            return { data: [], total: 0, limit: query.limit ?? 20, offset: query.offset ?? 0 };
          }
          where.legalEntity = query.legalEntity;
        } else {
          where.legalEntity = query.legalEntity;
        }
      } else if (!hasAllEntities && allowedEntities.length > 0) {
        where.legalEntity = { in: allowedEntities };
      }
    } else {
      if (query.site) where.site = query.site;
      if (query.state) where.state = query.state;
      if (query.legalEntity) where.legalEntity = query.legalEntity;
    }

    // 2. Apply Explicit Filter Overrides (within scope)
    const stage = query.pipelineStage || query.stage;
    if (stage) {
      where.pipelineStage = stage as unknown as any;
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

    // Mask patient summary details in operational list projections (minimum necessary)
    const projectedData = data.map((r: any) => {
      const trackingNumber = r.trackingNumber || `REF-${r.id.slice(0, 8).toUpperCase()}`;
      if (!r.patient) {
        return { ...r, trackingNumber };
      }
      return {
        ...r,
        trackingNumber,
        patient: {
          ...r.patient,
          medicalRecordNumber: r.patient.medicalRecordNumber
            ? `MRN-***${r.patient.medicalRecordNumber.slice(-4)}`
            : null,
          phone: r.patient.phone ? `(***) ***-${r.patient.phone.slice(-4)}` : null,
        },
      };
    });

    return {
      data: projectedData,
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

    const isAdmin = user.roles?.some((r) => r === UserRole.ADMIN || r === UserRole.COMPLIANCE);
    const where: Prisma.ReferralWhereInput = {};
    if (!isAdmin) {
      const hasAnyScope =
        (user.scopes?.sites?.length ?? 0) > 0 ||
        (user.scopes?.states?.length ?? 0) > 0 ||
        (user.scopes?.legalEntities?.length ?? 0) > 0;
      if (!hasAnyScope) {
        return {
          totalActive: 0,
          byStage,
          byStatus,
          overdue: 0,
          dueToday: 0,
        };
      }

      if (user.scopes?.sites && user.scopes.sites.length > 0) {
        where.site = { in: user.scopes.sites };
      }
      if (user.scopes?.states && user.scopes.states.length > 0) {
        where.state = { in: user.scopes.states };
      }
      if (user.scopes?.legalEntities && user.scopes.legalEntities.length > 0) {
        where.legalEntity = { in: user.scopes.legalEntities };
      }
    }

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
