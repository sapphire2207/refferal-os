import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import {
  CreateClaimDto,
  SubmitClaimDto,
  AdjudicateClaimDto,
  QueryClaimsDto,
} from './dto/billing.dto';
import {
  AuthTokenPayload,
  UserRole,
  BillingStatus,
  WorkStatus,
  CaseOutcome,
} from '@heals/types';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Scope verification against parent referral location.
   */
  private checkScope(user: AuthTokenPayload, referral: any) {
    const isAdmin = user.roles?.some((r) => r === UserRole.ADMIN || r === UserRole.COMPLIANCE);
    if (isAdmin) return;

    const allowedStates = user.scopes?.states || [];
    const allowedSites = user.scopes?.sites || [];

    if (allowedStates.length === 0 && allowedSites.length === 0) return;

    const stateMatch = referral.state && allowedStates.includes(referral.state);
    const siteMatch = referral.site && allowedSites.includes(referral.site);

    if (!stateMatch && !siteMatch) {
      throw new ForbiddenException(
        'Access to billing for this referral is restricted by your assigned location scope.',
      );
    }
  }

  /**
   * Evaluates comprehensive billing readiness criteria.
   * Ensures insurance verification, demographic completeness, and approved clinical documentation.
   */
  async validateBillingReadiness(referralId: string, user: AuthTokenPayload) {
    const referral = await this.prisma.referral.findUnique({
      where: { id: referralId },
      include: {
        patient: true,
        clinicalNotes: true,
        noteReviews: true,
      },
    });

    if (!referral) {
      throw new NotFoundException(`Referral ${referralId} not found.`);
    }

    this.checkScope(user, referral);

    const blockers: string[] = [];

    // 1. Coverage verification gate
    if (!referral.coverageVerified) {
      blockers.push('Insurance coverage has not been verified.');
    }

    // 2. Payer and Member ID gate
    if (!referral.insurancePayer || !referral.insuranceMemberId) {
      blockers.push('Insurance payer name or policy member ID is missing.');
    }

    // 3. Digitally signed clinical note gate
    const hasSignedNote = referral.clinicalNotes?.some((n: any) => n.signedAt !== null);
    if (!hasSignedNote) {
      blockers.push('No digitally signed clinical note found for this referral.');
    }

    // 4. Notes QA approval gate
    const hasApprovedNoteReview = referral.noteReviews?.some((r: any) => r.decision === 'APPROVE');
    if (!hasApprovedNoteReview) {
      blockers.push('Clinical note has not received Notes QA approval.');
    }

    return {
      referralId,
      isReady: blockers.length === 0,
      blockers,
      referral,
    };
  }

  /**
   * Creates a claim record once billing readiness is established.
   */
  async createClaim(dto: CreateClaimDto, user: AuthTokenPayload) {
    const readiness = await this.validateBillingReadiness(dto.referralId, user);

    if (!readiness.isReady) {
      throw new BadRequestException(
        `Referral is not billing-ready: ${readiness.blockers.join('; ')}`,
      );
    }

    const claimNumber =
      dto.claimNumber?.trim() ||
      `CLM-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const claim = await this.prisma.$transaction(async (tx) => {
      const created = await tx.claim.create({
        data: {
          referralId: dto.referralId,
          claimNumber,
          status: BillingStatus.READY as any,
        },
      });

      await tx.referral.update({
        where: { id: dto.referralId },
        data: {
          billingStatus: BillingStatus.READY as any,
        },
      });

      return created;
    });

    this.logger.log(`Created claim ${claim.id} (${claimNumber}) for referral ${dto.referralId}`);
    return claim;
  }

  /**
   * Submits claim to clearinghouse / payer with duplicate submission safeguard.
   */
  async submitClaim(claimId: string, dto: SubmitClaimDto, user: AuthTokenPayload) {
    const claim = await this.prisma.claim.findUnique({
      where: { id: claimId },
      include: { referral: true },
    });

    if (!claim) {
      throw new NotFoundException(`Claim ${claimId} not found.`);
    }

    this.checkScope(user, claim.referral);

    if (claim.status === BillingStatus.SUBMITTED && !dto.forceResubmit) {
      throw new BadRequestException(
        `Claim ${claimId} was already submitted to the clearinghouse (Reference: ${claim.externalReference || 'pending'}). Blind re-submission is prohibited while adjudication is active.`,
      );
    }

    const externalReference =
      dto.externalReference?.trim() ||
      `EDI-837P-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

    const updated = await this.prisma.$transaction(async (tx) => {
      const submitted = await tx.claim.update({
        where: { id: claimId },
        data: {
          status: BillingStatus.SUBMITTED as any,
          submittedAt: new Date(),
          submittedById: user.userId,
          externalReference,
        },
      });

      await tx.referral.update({
        where: { id: claim.referralId },
        data: {
          billingStatus: BillingStatus.SUBMITTED as any,
          version: { increment: 1 },
        },
      });

      await tx.workflowTransition.create({
        data: {
          referralId: claim.referralId,
          fromStage: claim.referral.pipelineStage as any,
          toStage: claim.referral.pipelineStage as any,
          fromStatus: claim.referral.workStatus as any,
          toStatus: claim.referral.workStatus as any,
          transitionedBy: user.userId,
          reason: `Electronic claim submitted to payer. Reference: ${externalReference}`,
        },
      });

      return submitted;
    });

    this.logger.log(`Submitted claim ${claimId} with reference ${externalReference}`);
    return updated;
  }

  /**
   * Records claim adjudication outcome: PAID, DENIED, or REJECTED.
   */
  async adjudicateClaim(claimId: string, dto: AdjudicateClaimDto, user: AuthTokenPayload) {
    const claim = await this.prisma.claim.findUnique({
      where: { id: claimId },
      include: { referral: true },
    });

    if (!claim) {
      throw new NotFoundException(`Claim ${claimId} not found.`);
    }

    this.checkScope(user, claim.referral);

    if (dto.status === BillingStatus.PAID && (dto.paidAmount === undefined || dto.paidAmount < 0)) {
      throw new BadRequestException('A valid paidAmount is required when recording a PAID claim adjudication.');
    }

    if (dto.status === BillingStatus.DENIED && (!dto.denialReason || !dto.denialReason.trim())) {
      throw new BadRequestException('A denialReason is mandatory when recording a DENIED claim adjudication.');
    }

    if (dto.status === BillingStatus.REJECTED && (!dto.rejectionReason || !dto.rejectionReason.trim())) {
      throw new BadRequestException('A rejectionReason is mandatory when recording a REJECTED claim adjudication.');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const updatedClaim = await tx.claim.update({
        where: { id: claimId },
        data: {
          status: dto.status as any,
          ...(dto.status === BillingStatus.PAID && {
            paidAmount: dto.paidAmount,
            paidAt: now,
          }),
          ...(dto.status === BillingStatus.DENIED && {
            denialReason: dto.denialReason?.trim(),
          }),
          ...(dto.status === BillingStatus.REJECTED && {
            rejectionReason: dto.rejectionReason?.trim(),
          }),
        },
      });

      let updatedReferral;
      if (dto.status === BillingStatus.PAID) {
        // Complete the case lifecycle
        updatedReferral = await tx.referral.update({
          where: { id: claim.referralId },
          data: {
            billingStatus: BillingStatus.PAID as any,
            workStatus: WorkStatus.COMPLETED as any,
            caseOutcome: CaseOutcome.CLOSED as any,
            version: { increment: 1 },
          },
        });
      } else {
        // Denial or Rejection requires operational billing follow-up
        updatedReferral = await tx.referral.update({
          where: { id: claim.referralId },
          data: {
            billingStatus: dto.status as any,
            workStatus: WorkStatus.BLOCKED_NEEDS_INFO as any,
            version: { increment: 1 },
          },
        });
      }

      await tx.workflowTransition.create({
        data: {
          referralId: claim.referralId,
          fromStage: claim.referral.pipelineStage as any,
          toStage: claim.referral.pipelineStage as any,
          fromStatus: claim.referral.workStatus as any,
          toStatus: updatedReferral.workStatus as any,
          transitionedBy: user.userId,
          reason: `Claim adjudication: ${dto.status}. Notes: ${dto.denialReason || dto.rejectionReason || `Paid $${dto.paidAmount}`}`,
        },
      });

      return { claim: updatedClaim, referral: updatedReferral };
    });

    this.logger.log(`Adjudicated claim ${claimId}: status ${dto.status}`);
    return result;
  }

  /**
   * Queries claims with pagination and location scope filtering.
   */
  async findAllClaims(query: QueryClaimsDto, user: AuthTokenPayload) {
    const page = query.page && query.page > 0 ? Number(query.page) : 1;
    const limit = query.limit && query.limit > 0 ? Number(query.limit) : 20;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.referralId) {
      where.referralId = query.referralId;
    }

    if (query.status) {
      where.status = query.status;
    }

    const isAdmin = user.roles?.some((r) => r === UserRole.ADMIN || r === UserRole.COMPLIANCE);
    if (!isAdmin) {
      const allowedStates = user.scopes?.states || [];
      const allowedSites = user.scopes?.sites || [];

      if (allowedStates.length > 0 || allowedSites.length > 0) {
        where.referral = {
          OR: [
            ...(allowedStates.length > 0 ? [{ state: { in: allowedStates } }] : []),
            ...(allowedSites.length > 0 ? [{ site: { in: allowedSites } }] : []),
          ],
        };
      }
    }

    const [total, data] = await Promise.all([
      this.prisma.claim.count({ where }),
      this.prisma.claim.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          submittedBy: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          referral: {
            select: {
              id: true,
              pipelineStage: true,
              workStatus: true,
              billingStatus: true,
              patient: true,
              insurancePayer: true,
              insuranceMemberId: true,
              site: true,
              state: true,
            },
          },
        },
      }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Retrieves single claim by ID with full details.
   */
  async findClaimById(id: string, user: AuthTokenPayload) {
    const claim = await this.prisma.claim.findUnique({
      where: { id },
      include: {
        submittedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        referral: {
          include: { patient: true },
        },
      },
    });

    if (!claim) {
      throw new NotFoundException(`Claim ${id} not found.`);
    }

    this.checkScope(user, claim.referral);
    return claim;
  }
}
