import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import {
  CreateClinicalReviewDto,
  QueryClinicalReviewsDto,
} from './dto/clinical-review.dto';
import {
  AuthTokenPayload,
  UserRole,
  ClinicalReviewDecision,
  PipelineStage,
  WorkStatus,
  CaseOutcome,
} from '@heals/types';

@Injectable()
export class ClinicalReviewService {
  private readonly logger = new Logger(ClinicalReviewService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Scope verification against parent referral location.
   */
  private checkScope(user: AuthTokenPayload, referral: any) {
    const isAdmin = user.roles?.some((r) => r === UserRole.ADMIN || r === UserRole.COMPLIANCE);
    if (isAdmin) return;

    const allowedStates = user.scopes?.states || [];
    const allowedSites = user.scopes?.sites || [];

    const isUnrestricted =
      allowedStates.includes('ALL') ||
      allowedSites.includes('ALL') ||
      allowedStates.includes('*') ||
      allowedSites.includes('*');

    if (isUnrestricted) return;

    if (allowedStates.length === 0 && allowedSites.length === 0) {
      throw new ForbiddenException(
        'Access denied: You do not have an assigned location or territory scope.',
      );
    }

    const stateMatch = referral.state && allowedStates.includes(referral.state);
    const siteMatch = referral.site && allowedSites.includes(referral.site);

    if (!stateMatch && !siteMatch) {
      throw new ForbiddenException(
        'Access to review this referral is restricted by your assigned location scope.',
      );
    }
  }

  /**
   * Submits a clinical review decision and coordinates referral pipeline transition.
   */
  async createReview(dto: CreateClinicalReviewDto, user: AuthTokenPayload) {
    const referral = await this.prisma.referral.findUnique({
      where: { id: dto.referralId },
    });

    if (!referral) {
      throw new NotFoundException(`Referral ${dto.referralId} not found.`);
    }

    this.checkScope(user, referral);

    // Validate that referral is currently in CLINICAL_REVIEW stage
    if (referral.pipelineStage !== PipelineStage.CLINICAL_REVIEW) {
      throw new BadRequestException(
        `Cannot submit clinical review: referral is currently in stage '${referral.pipelineStage}', expected '${PipelineStage.CLINICAL_REVIEW}'.`,
      );
    }

    // Require reason for return or reject decisions
    if (
      (dto.decision === ClinicalReviewDecision.RETURN ||
        dto.decision === ClinicalReviewDecision.REJECT) &&
      (!dto.reason || !dto.reason.trim())
    ) {
      throw new BadRequestException(
        `A clinical reason is mandatory when decision is '${dto.decision}'.`,
      );
    }

    // Coordinate state machine transition based on decision
    let toStage: PipelineStage = referral.pipelineStage as PipelineStage;
    let toStatus: WorkStatus = referral.workStatus as WorkStatus;
    let caseOutcome: CaseOutcome = referral.caseOutcome as CaseOutcome;

    if (dto.decision === ClinicalReviewDecision.ACCEPT) {
      toStage = PipelineStage.SCHEDULING;
      toStatus = WorkStatus.PENDING;
    } else if (dto.decision === ClinicalReviewDecision.RETURN) {
      toStage = PipelineStage.INTAKE;
      toStatus = WorkStatus.BLOCKED_NEEDS_INFO;
    } else if (dto.decision === ClinicalReviewDecision.REJECT) {
      toStage = PipelineStage.CLINICAL_REVIEW;
      toStatus = WorkStatus.COMPLETED;
      caseOutcome = CaseOutcome.REJECTED;
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Create ClinicalReview record
      const review = await tx.clinicalReview.create({
        data: {
          referralId: dto.referralId,
          reviewerId: user.userId,
          decision: dto.decision,
          reason: dto.reason?.trim() || null,
          notes: dto.notes?.trim() || null,
        },
      });

      // 2. Update Referral stage, status, outcome and increment version
      const updatedReferral = await tx.referral.update({
        where: { id: dto.referralId },
        data: {
          pipelineStage: toStage as any,
          workStatus: toStatus as any,
          caseOutcome: caseOutcome as any,
          version: { increment: 1 },
        },
      });

      // 3. Record WorkflowTransition audit trail
      await tx.workflowTransition.create({
        data: {
          referralId: dto.referralId,
          fromStage: referral.pipelineStage as any,
          toStage: toStage as any,
          fromStatus: referral.workStatus as any,
          toStatus: toStatus as any,
          transitionedBy: user.userId,
          reason: dto.reason || dto.notes || `Clinical review decision: ${dto.decision}`,
        },
      });

      return { review, referral: updatedReferral };
    });

    this.logger.log(
      `Recorded clinical review ${result.review.id} for referral ${dto.referralId}: decision ${dto.decision} -> stage ${toStage}`,
    );

    return result;
  }

  /**
   * Retrieves review history for a specific referral in chronological order.
   */
  async findByReferralId(referralId: string, user: AuthTokenPayload) {
    const referral = await this.prisma.referral.findUnique({
      where: { id: referralId },
    });

    if (!referral) {
      throw new NotFoundException(`Referral ${referralId} not found.`);
    }

    this.checkScope(user, referral);

    return this.prisma.clinicalReview.findMany({
      where: { referralId },
      orderBy: { reviewedAt: 'desc' },
      include: {
        reviewer: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });
  }

  /**
   * Queries clinical reviews with filters and scope enforcement.
   */
  async findAll(query: QueryClinicalReviewsDto, user: AuthTokenPayload) {
    const where: any = {};

    if (query.referralId) {
      where.referralId = query.referralId;
    }

    if (query.reviewerId) {
      where.reviewerId = query.reviewerId;
    }

    if (query.decision) {
      where.decision = query.decision;
    }

    const isAdmin = user.roles?.some((r) => r === UserRole.ADMIN || r === UserRole.COMPLIANCE);
    if (!isAdmin) {
      const allowedStates = user.scopes?.states || [];
      const allowedSites = user.scopes?.sites || [];

      if (allowedStates.length === 0 && allowedSites.length === 0) {
        return [];
      }

      where.referral = {
        OR: [
          ...(allowedStates.length > 0 ? [{ state: { in: allowedStates } }] : []),
          ...(allowedSites.length > 0 ? [{ site: { in: allowedSites } }] : []),
        ],
      };
    }

    return this.prisma.clinicalReview.findMany({
      where,
      orderBy: { reviewedAt: 'desc' },
      include: {
        reviewer: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        referral: {
          select: { id: true, pipelineStage: true, workStatus: true, caseOutcome: true, site: true, state: true },
        },
      },
    });
  }

  /**
   * Retrieves single review by ID.
   */
  async findById(id: string, user: AuthTokenPayload) {
    const review = await this.prisma.clinicalReview.findUnique({
      where: { id },
      include: {
        reviewer: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        referral: true,
      },
    });

    if (!review) {
      throw new NotFoundException(`Clinical review ${id} not found.`);
    }

    this.checkScope(user, review.referral);
    return review;
  }
}
