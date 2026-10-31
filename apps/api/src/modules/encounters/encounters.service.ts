import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import {
  CreateEncounterDto,
  CreateClinicalNoteDto,
  UpdateClinicalNoteDto,
  ReviewNoteDto,
  QueryEncountersDto,
} from './dto/encounters.dto';
import {
  AuthTokenPayload,
  UserRole,
  VisitOutcome,
  NoteReviewDecision,
  PipelineStage,
  WorkStatus,
  BillingStatus,
} from '@heals/types';

@Injectable()
export class EncountersService {
  private readonly logger = new Logger(EncountersService.name);

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
        'Access to encounters/notes for this referral is restricted by your assigned location scope.',
      );
    }
  }

  /**
   * Records a mobile Nurse Practitioner clinical visit encounter.
   */
  async createEncounter(dto: CreateEncounterDto, user: AuthTokenPayload) {
    const referral = await this.prisma.referral.findUnique({
      where: { id: dto.referralId },
      include: { patient: true },
    });

    if (!referral) {
      throw new NotFoundException(`Referral ${dto.referralId} not found.`);
    }

    this.checkScope(user, referral);

    const npId = dto.nursePractitionerId || user.userId;

    const encounter = await this.prisma.$transaction(async (tx) => {
      const isCompleted = dto.outcome === VisitOutcome.COMPLETED;
      const isNoShow = dto.outcome === VisitOutcome.NO_SHOW;

      const enc = await tx.encounter.create({
        data: {
          referralId: dto.referralId,
          appointmentId: dto.appointmentId || null,
          outcome: dto.outcome,
          dateOfService: dto.dateOfService ? new Date(dto.dateOfService) : new Date(),
          nursePractitionerId: npId,
          servicesProvided: dto.servicesProvided,
          encounterNotes: dto.encounterNotes?.trim() || null,
          completedAt: isCompleted ? new Date() : null,
        },
      });

      if (isCompleted) {
        await tx.referral.update({
          where: { id: dto.referralId },
          data: {
            pipelineStage: PipelineStage.NP_VISIT as any,
            workStatus: WorkStatus.IN_PROGRESS as any,
          },
        });
      } else if (isNoShow) {
        await tx.referral.update({
          where: { id: dto.referralId },
          data: {
            workStatus: WorkStatus.BLOCKED_NEEDS_INFO as any,
            version: { increment: 1 },
          },
        });

        await tx.workflowTransition.create({
          data: {
            referralId: dto.referralId,
            fromStage: referral.pipelineStage as any,
            toStage: referral.pipelineStage as any,
            fromStatus: referral.workStatus as any,
            toStatus: WorkStatus.BLOCKED_NEEDS_INFO as any,
            transitionedBy: user.userId,
            reason: `Patient visit outcome: NO_SHOW. Rescheduling or outreach required.`,
          },
        });
      }

      return enc;
    });

    this.logger.log(
      `Created encounter ${encounter.id} for referral ${dto.referralId} with outcome ${dto.outcome}`,
    );

    return encounter;
  }

  /**
   * Queries encounters with pagination and scope enforcement.
   */
  async findAllEncounters(query: QueryEncountersDto, user: AuthTokenPayload) {
    const page = query.page && query.page > 0 ? Number(query.page) : 1;
    const limit = query.limit && query.limit > 0 ? Number(query.limit) : 20;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.referralId) {
      where.referralId = query.referralId;
    }

    if (query.nursePractitionerId) {
      where.nursePractitionerId = query.nursePractitionerId;
    }

    if (query.outcome) {
      where.outcome = query.outcome;
    }

    const isAdmin = user.roles?.some((r) => r === UserRole.ADMIN || r === UserRole.COMPLIANCE);
    if (!isAdmin) {
      const allowedStates = user.scopes?.states || [];
      const allowedSites = user.scopes?.sites || [];

      if (allowedStates.length === 0 && allowedSites.length === 0) {
        return { data: [], total: 0, page, limit, totalPages: 0 };
      }

      where.referral = {
        OR: [
          ...(allowedStates.length > 0 ? [{ state: { in: allowedStates } }] : []),
          ...(allowedSites.length > 0 ? [{ site: { in: allowedSites } }] : []),
        ],
      };
    }

    const [total, data] = await Promise.all([
      this.prisma.encounter.count({ where }),
      this.prisma.encounter.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          nursePractitioner: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          clinicalNotes: {
            select: { id: true, noteType: true, signedAt: true, createdAt: true },
          },
          referral: {
            select: { id: true, pipelineStage: true, workStatus: true, patient: true, site: true, state: true },
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
   * Retrieves single encounter by ID.
   */
  async findEncounterById(id: string, user: AuthTokenPayload) {
    const enc = await this.prisma.encounter.findUnique({
      where: { id },
      include: {
        nursePractitioner: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        clinicalNotes: true,
        appointment: true,
        referral: {
          include: { patient: true },
        },
      },
    });

    if (!enc) {
      throw new NotFoundException(`Encounter ${id} not found.`);
    }

    this.checkScope(user, enc.referral);
    return enc;
  }

  /**
   * Creates a draft clinical note linked to an encounter.
   */
  async createNote(dto: CreateClinicalNoteDto, user: AuthTokenPayload) {
    const encounter = await this.prisma.encounter.findUnique({
      where: { id: dto.encounterId },
      include: { referral: true },
    });

    if (!encounter) {
      throw new NotFoundException(`Encounter ${dto.encounterId} not found.`);
    }

    if (encounter.referralId !== dto.referralId) {
      throw new BadRequestException('Encounter does not match the specified referralId.');
    }

    this.checkScope(user, encounter.referral);

    const note = await this.prisma.clinicalNote.create({
      data: {
        referralId: dto.referralId,
        encounterId: dto.encounterId,
        content: dto.content.trim(),
        noteType: dto.noteType.trim(),
        createdById: user.userId,
      },
    });

    this.logger.log(`Created draft clinical note ${note.id} for encounter ${dto.encounterId}`);
    return note;
  }

  /**
   * Updates an unsigned draft clinical note.
   * Enforces immutability: signed notes can never be edited directly.
   */
  async updateDraftNote(id: string, dto: UpdateClinicalNoteDto, user: AuthTokenPayload) {
    const note = await this.prisma.clinicalNote.findUnique({
      where: { id },
      include: { referral: true },
    });

    if (!note) {
      throw new NotFoundException(`Clinical note ${id} not found.`);
    }

    this.checkScope(user, note.referral);

    if (note.signedAt) {
      throw new BadRequestException(
        'Cannot modify a digitally signed clinical note. Signed medical records are immutable; revisions or corrections must proceed through Notes QA review.',
      );
    }

    const updated = await this.prisma.clinicalNote.update({
      where: { id },
      data: {
        content: dto.content.trim(),
      },
    });

    this.logger.log(`Updated draft clinical note ${id}`);
    return updated;
  }

  /**
   * Digitally signs clinical note and submits to NOTES_QA stage.
   */
  async signAndSubmitNote(id: string, user: AuthTokenPayload) {
    const note = await this.prisma.clinicalNote.findUnique({
      where: { id },
      include: { referral: true },
    });

    if (!note) {
      throw new NotFoundException(`Clinical note ${id} not found.`);
    }

    this.checkScope(user, note.referral);

    if (note.signedAt) {
      throw new BadRequestException('Clinical note is already digitally signed.');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const signedNote = await tx.clinicalNote.update({
        where: { id },
        data: {
          signedAt: now,
          signedById: user.userId,
          submittedAt: now,
        },
      });

      // Advance referral to NOTES_QA stage
      const updatedReferral = await tx.referral.update({
        where: { id: note.referralId },
        data: {
          pipelineStage: PipelineStage.NOTES_QA as any,
          workStatus: WorkStatus.PENDING as any,
          version: { increment: 1 },
        },
      });

      await tx.workflowTransition.create({
        data: {
          referralId: note.referralId,
          fromStage: note.referral.pipelineStage as any,
          toStage: PipelineStage.NOTES_QA as any,
          fromStatus: note.referral.workStatus as any,
          toStatus: WorkStatus.PENDING as any,
          transitionedBy: user.userId,
          reason: `Clinical note signed by NP (${user.email}) and submitted for QA approval.`,
        },
      });

      return { note: signedNote, referral: updatedReferral };
    });

    this.logger.log(
      `Digitally signed note ${id}. Referral ${note.referralId} advanced to NOTES_QA.`,
    );

    return result;
  }

  /**
   * Notes QA Review: Approve or Return note for correction.
   */
  async reviewNote(id: string, dto: ReviewNoteDto, user: AuthTokenPayload) {
    const hasClinicalAuthority = user.roles?.some(
      (r) => r === UserRole.CLINICAL_REVIEWER || r === UserRole.CLINICAL_COORDINATOR,
    );
    if (!hasClinicalAuthority) {
      throw new ForbiddenException(
        'Access denied: Administrative and non-clinical roles are not permitted to review or approve clinical notes.',
      );
    }

    const note = await this.prisma.clinicalNote.findUnique({
      where: { id },
      include: { referral: true },
    });

    if (!note) {
      throw new NotFoundException(`Clinical note ${id} not found.`);
    }

    this.checkScope(user, note.referral);

    if (!note.signedAt) {
      throw new BadRequestException('Cannot review an unsigned draft note.');
    }

    if (
      dto.decision === NoteReviewDecision.RETURN_FOR_CORRECTION &&
      !dto.correctionRequired &&
      !dto.reason
    ) {
      throw new BadRequestException(
        'Specific correction details or reason must be provided when returning a note for correction.',
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Create NoteReview record
      const review = await tx.noteReview.create({
        data: {
          clinicalNoteId: id,
          referralId: note.referralId,
          reviewerId: user.userId,
          decision: dto.decision,
          reason: dto.reason?.trim() || null,
          correctionRequired: dto.correctionRequired?.trim() || null,
        },
      });

      if (dto.decision === NoteReviewDecision.APPROVE) {
        // Advance to BILLING stage, billingStatus = READY
        const updatedReferral = await tx.referral.update({
          where: { id: note.referralId },
          data: {
            pipelineStage: PipelineStage.BILLING as any,
            workStatus: WorkStatus.PENDING as any,
            billingStatus: BillingStatus.READY as any,
            version: { increment: 1 },
          },
        });

        await tx.workflowTransition.create({
          data: {
            referralId: note.referralId,
            fromStage: PipelineStage.NOTES_QA as any,
            toStage: PipelineStage.BILLING as any,
            fromStatus: note.referral.workStatus as any,
            toStatus: WorkStatus.PENDING as any,
            transitionedBy: user.userId,
            reason: dto.reason || 'Notes QA approved clinical documentation. Ready for billing.',
          },
        });

        return { review, referral: updatedReferral };
      } else {
        // RETURN_FOR_CORRECTION: Return to NP_VISIT stage and reassign to originating NP
        const updatedReferral = await tx.referral.update({
          where: { id: note.referralId },
          data: {
            pipelineStage: PipelineStage.NP_VISIT as any,
            workStatus: WorkStatus.BLOCKED_NEEDS_INFO as any,
            assignedTo: note.createdById,
            assignedRole: UserRole.NURSE_PRACTITIONER as any,
            version: { increment: 1 },
          },
        });

        await tx.workflowTransition.create({
          data: {
            referralId: note.referralId,
            fromStage: PipelineStage.NOTES_QA as any,
            toStage: PipelineStage.NP_VISIT as any,
            fromStatus: note.referral.workStatus as any,
            toStatus: WorkStatus.BLOCKED_NEEDS_INFO as any,
            transitionedBy: user.userId,
            reason: `Notes QA returned for correction: ${dto.correctionRequired || dto.reason}`,
          },
        });

        return { review, referral: updatedReferral };
      }
    });

    this.logger.log(
      `Recorded Notes QA review for note ${id}: decision ${dto.decision} -> stage ${result.referral.pipelineStage}`,
    );

    return result;
  }

  /**
   * Reviews the clinical documentation for a referral (used by Notes QA queue).
   * Finds the latest signed clinical note or active note for the referral, or processes review directly.
   */
  async reviewNoteByReferral(referralId: string, dto: ReviewNoteDto, user: AuthTokenPayload) {
    const hasClinicalAuthority = user.roles?.some(
      (r) => r === UserRole.CLINICAL_REVIEWER || r === UserRole.CLINICAL_COORDINATOR,
    );
    if (!hasClinicalAuthority) {
      throw new ForbiddenException(
        'Access denied: Administrative and non-clinical roles are not permitted to review or approve clinical notes.',
      );
    }

    const referral = await this.prisma.referral.findUnique({
      where: { id: referralId },
    });
    if (!referral) {
      throw new NotFoundException(`Referral ${referralId} not found.`);
    }
    this.checkScope(user, referral);

    // Look for clinical note
    const note = await this.prisma.clinicalNote.findFirst({
      where: { referralId },
      orderBy: { createdAt: 'desc' },
    });

    if (note && note.signedAt) {
      return this.reviewNote(note.id, dto, user);
    }

    // If no signed clinical note exists yet (e.g. synthetic or fast-tracked), perform referral stage transition safely
    const result = await this.prisma.$transaction(async (tx) => {
      if (dto.decision === NoteReviewDecision.APPROVE) {
        const updatedReferral = await tx.referral.update({
          where: { id: referralId },
          data: {
            pipelineStage: PipelineStage.BILLING as any,
            workStatus: WorkStatus.PENDING as any,
            billingStatus: BillingStatus.READY as any,
            version: { increment: 1 },
          },
        });
        await tx.workflowTransition.create({
          data: {
            referralId,
            fromStage: PipelineStage.NOTES_QA as any,
            toStage: PipelineStage.BILLING as any,
            fromStatus: referral.workStatus as any,
            toStatus: WorkStatus.PENDING as any,
            transitionedBy: user.userId,
            reason: dto.reason || 'Notes QA approved clinical documentation. Ready for billing.',
          },
        });
        return { review: null, referral: updatedReferral };
      } else {
        const updatedReferral = await tx.referral.update({
          where: { id: referralId },
          data: {
            pipelineStage: PipelineStage.NP_VISIT as any,
            workStatus: WorkStatus.BLOCKED_NEEDS_INFO as any,
            version: { increment: 1 },
          },
        });
        await tx.workflowTransition.create({
          data: {
            referralId,
            fromStage: PipelineStage.NOTES_QA as any,
            toStage: PipelineStage.NP_VISIT as any,
            fromStatus: referral.workStatus as any,
            toStatus: WorkStatus.BLOCKED_NEEDS_INFO as any,
            transitionedBy: user.userId,
            reason: `Notes QA returned for correction: ${dto.correctionRequired || dto.reason || 'Documentation corrections required.'}`,
          },
        });
        return { review: null, referral: updatedReferral };
      }
    });

    return result;
  }

  /**
   * Retrieves single note by ID with author, signer, and review history.
   */
  async findNoteById(id: string, user: AuthTokenPayload) {
    const note = await this.prisma.clinicalNote.findUnique({
      where: { id },
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        signedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        reviews: {
          include: {
            reviewer: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
          },
          orderBy: { reviewedAt: 'desc' },
        },
        referral: true,
      },
    });

    if (!note) {
      throw new NotFoundException(`Clinical note ${id} not found.`);
    }

    this.checkScope(user, note.referral);
    return note;
  }
}
