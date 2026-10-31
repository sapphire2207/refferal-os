import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import {
  BookAppointmentDto,
  ConfirmAppointmentDto,
  CancelAppointmentDto,
  RescheduleAppointmentDto,
  QueryAppointmentsDto,
} from './dto/appointments.dto';
import {
  AuthTokenPayload,
  UserRole,
  PipelineStage,
  WorkStatus,
} from '@heals/types';

@Injectable()
export class AppointmentsService {
  private readonly logger = new Logger(AppointmentsService.name);

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
        'Access to scheduling for this referral is restricted by your assigned location scope.',
      );
    }
  }

  /**
   * Books an appointment for a patient referral with NP assignment.
   */
  async bookAppointment(dto: BookAppointmentDto, user: AuthTokenPayload) {
    const referral = await this.prisma.referral.findUnique({
      where: { id: dto.referralId },
      include: { patient: true },
    });

    if (!referral) {
      throw new NotFoundException(`Referral ${dto.referralId} not found.`);
    }

    this.checkScope(user, referral);

    if (
      referral.pipelineStage !== PipelineStage.SCHEDULING &&
      referral.pipelineStage !== PipelineStage.INTAKE &&
      referral.pipelineStage !== PipelineStage.CLINICAL_REVIEW
    ) {
      throw new BadRequestException(
        `Cannot book appointment: referral is currently in stage '${referral.pipelineStage}'.`,
      );
    }

    // Validate Nurse Practitioner credentials and active status
    const np = await this.prisma.user.findUnique({
      where: { id: dto.nursePractitionerId },
      include: { userRoles: true, userScopes: true },
    });

    if (!np || !np.isActive || np.isSuspended) {
      throw new BadRequestException('Selected Nurse Practitioner is inactive or invalid.');
    }

    const hasNpRole = np.userRoles.some((ur: any) => ur.role === UserRole.NURSE_PRACTITIONER);
    if (!hasNpRole) {
      throw new BadRequestException('Assigned clinician must possess NURSE_PRACTITIONER role.');
    }

    const appointment = await this.prisma.$transaction(async (tx) => {
      const appt = await tx.appointment.create({
        data: {
          referralId: dto.referralId,
          scheduledDate: new Date(dto.scheduledDate),
          scheduledTime: dto.scheduledTime.trim(),
          durationMinutes: dto.durationMinutes || 60,
          nursePractitionerId: dto.nursePractitionerId,
          location: dto.location?.trim() || `${referral.patient.addressLine1 || ''}, ${referral.patient.city || ''}, ${referral.patient.state || ''}`.trim(),
          createdById: user.userId,
        },
      });

      // Update referral to IN_PROGRESS in SCHEDULING stage
      await tx.referral.update({
        where: { id: dto.referralId },
        data: {
          pipelineStage: PipelineStage.SCHEDULING as any,
          workStatus: WorkStatus.IN_PROGRESS as any,
          assignedTo: dto.nursePractitionerId,
          assignedRole: UserRole.NURSE_PRACTITIONER as any,
        },
      });

      return appt;
    });

    this.logger.log(
      `Booked appointment ${appointment.id} for referral ${dto.referralId} on ${dto.scheduledDate}`,
    );

    return appointment;
  }

  /**
   * Confirms appointment and transitions referral state to NP_VISIT.
   */
  async confirmAppointment(id: string, dto: ConfirmAppointmentDto, user: AuthTokenPayload) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
      include: { referral: true },
    });

    if (!appointment) {
      throw new NotFoundException(`Appointment ${id} not found.`);
    }

    this.checkScope(user, appointment.referral);

    if (appointment.cancelledAt) {
      throw new BadRequestException('Cannot confirm a cancelled appointment.');
    }

    if (appointment.confirmedAt) {
      throw new BadRequestException('Appointment is already confirmed.');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const confirmed = await tx.appointment.update({
        where: { id },
        data: {
          confirmedAt: new Date(),
          confirmedBy: user.userId,
        },
      });

      // Advance referral stage to NP_VISIT
      const updatedReferral = await tx.referral.update({
        where: { id: appointment.referralId },
        data: {
          pipelineStage: PipelineStage.NP_VISIT as any,
          workStatus: WorkStatus.PENDING as any,
          assignedTo: appointment.nursePractitionerId,
          assignedRole: UserRole.NURSE_PRACTITIONER as any,
          version: { increment: 1 },
        },
      });

      // Create workflow transition audit
      await tx.workflowTransition.create({
        data: {
          referralId: appointment.referralId,
          fromStage: appointment.referral.pipelineStage as any,
          toStage: PipelineStage.NP_VISIT as any,
          fromStatus: appointment.referral.workStatus as any,
          toStatus: WorkStatus.PENDING as any,
          transitionedBy: user.userId,
          reason: dto.notes || `Appointment confirmed for ${appointment.scheduledDate.toISOString().split('T')[0]} at ${appointment.scheduledTime}`,
        },
      });

      return { appointment: confirmed, referral: updatedReferral };
    });

    this.logger.log(
      `Confirmed appointment ${id}. Advanced referral ${appointment.referralId} to NP_VISIT stage.`,
    );

    return result;
  }

  /**
   * Cancels appointment and sets referral on hold.
   */
  async cancelAppointment(id: string, dto: CancelAppointmentDto, user: AuthTokenPayload) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
      include: { referral: true },
    });

    if (!appointment) {
      throw new NotFoundException(`Appointment ${id} not found.`);
    }

    this.checkScope(user, appointment.referral);

    if (appointment.cancelledAt) {
      throw new BadRequestException('Appointment is already cancelled.');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const cancelled = await tx.appointment.update({
        where: { id },
        data: {
          cancelledAt: new Date(),
          cancellationReason: dto.reason.trim(),
        },
      });

      await tx.referral.update({
        where: { id: appointment.referralId },
        data: {
          workStatus: WorkStatus.ON_HOLD as any,
          version: { increment: 1 },
        },
      });

      return cancelled;
    });

    this.logger.log(`Cancelled appointment ${id}: ${dto.reason}`);
    return result;
  }

  /**
   * Reschedules an appointment by cancelling the old appointment and linking a new one.
   */
  async rescheduleAppointment(
    id: string,
    dto: RescheduleAppointmentDto,
    user: AuthTokenPayload,
  ) {
    const oldAppt = await this.prisma.appointment.findUnique({
      where: { id },
      include: { referral: true },
    });

    if (!oldAppt) {
      throw new NotFoundException(`Appointment ${id} not found.`);
    }

    this.checkScope(user, oldAppt.referral);

    const npId = dto.nursePractitionerId || oldAppt.nursePractitionerId;

    const newAppt = await this.prisma.$transaction(async (tx) => {
      // 1. Mark old appointment cancelled with reschedule note
      await tx.appointment.update({
        where: { id },
        data: {
          cancelledAt: new Date(),
          cancellationReason: `Rescheduled to ${dto.newScheduledDate} ${dto.newScheduledTime}. Reason: ${dto.reason}`,
        },
      });

      // 2. Create new appointment referencing previous one
      const created = await tx.appointment.create({
        data: {
          referralId: oldAppt.referralId,
          scheduledDate: new Date(dto.newScheduledDate),
          scheduledTime: dto.newScheduledTime.trim(),
          durationMinutes: oldAppt.durationMinutes,
          nursePractitionerId: npId,
          location: oldAppt.location,
          rescheduledFromId: id,
          createdById: user.userId,
        },
      });

      // 3. Keep referral in SCHEDULING stage, IN_PROGRESS
      await tx.referral.update({
        where: { id: oldAppt.referralId },
        data: {
          pipelineStage: PipelineStage.SCHEDULING as any,
          workStatus: WorkStatus.IN_PROGRESS as any,
          assignedTo: npId,
          assignedRole: UserRole.NURSE_PRACTITIONER as any,
          version: { increment: 1 },
        },
      });

      return created;
    });

    this.logger.log(`Rescheduled appointment ${id} -> new appointment ${newAppt.id}`);
    return newAppt;
  }

  /**
   * Queries appointments with filters, date range, and scope validation.
   */
  async findAll(query: QueryAppointmentsDto, user: AuthTokenPayload) {
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

    if (query.scheduledDate) {
      where.scheduledDate = new Date(query.scheduledDate);
    }

    if (query.status === 'CONFIRMED') {
      where.confirmedAt = { not: null };
      where.cancelledAt = null;
    } else if (query.status === 'CANCELLED') {
      where.cancelledAt = { not: null };
    } else if (query.status === 'PENDING') {
      where.confirmedAt = null;
      where.cancelledAt = null;
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
      this.prisma.appointment.count({ where }),
      this.prisma.appointment.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ scheduledDate: 'asc' }, { scheduledTime: 'asc' }],
        include: {
          referral: {
            select: { id: true, pipelineStage: true, workStatus: true, patient: true, site: true, state: true },
          },
          createdBy: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          confirmedByUser: {
            select: { id: true, firstName: true, lastName: true, email: true },
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
   * Retrieves single appointment by ID with full referral and patient details.
   */
  async findById(id: string, user: AuthTokenPayload) {
    const appt = await this.prisma.appointment.findUnique({
      where: { id },
      include: {
        referral: {
          include: { patient: true },
        },
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        confirmedByUser: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        encounters: true,
      },
    });

    if (!appt) {
      throw new NotFoundException(`Appointment ${id} not found.`);
    }

    this.checkScope(user, appt.referral);
    return appt;
  }
}
