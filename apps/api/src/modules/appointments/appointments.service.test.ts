import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { PrismaService } from '../../database/prisma.service';
import {
  UserRole,
  AuthTokenPayload,
  PipelineStage,
  WorkStatus,
} from '@heals/types';

describe('AppointmentsService', () => {
  let service: AppointmentsService;
  let prisma: any;

  const mockReferralInScheduling = {
    id: 'ref-301',
    patientId: 'pat-301',
    pipelineStage: PipelineStage.SCHEDULING,
    workStatus: WorkStatus.PENDING,
    version: 1,
    site: 'FL-ORLANDO',
    state: 'FL',
    legalEntity: 'HEALS_FL',
    patient: {
      addressLine1: '123 Sunshine Way',
      city: 'Orlando',
      state: 'FL',
    },
  };

  const mockNpUser = {
    id: 'np-001',
    firstName: 'Florence',
    lastName: 'Nightingale',
    email: 'florence@heals.com',
    isActive: true,
    isSuspended: false,
    userRoles: [{ role: UserRole.NURSE_PRACTITIONER }],
    userScopes: [{ site: 'FL-ORLANDO', state: 'FL' }],
  };

  const mockAppointment = {
    id: 'appt-001',
    referralId: 'ref-301',
    scheduledDate: new Date('2026-11-05'),
    scheduledTime: '10:00 AM',
    durationMinutes: 60,
    nursePractitionerId: 'np-001',
    location: '123 Sunshine Way, Orlando, FL',
    confirmedAt: null,
    confirmedBy: null,
    cancelledAt: null,
    cancellationReason: null,
    rescheduledFromId: null,
    createdById: 'scheduler-1',
    referral: mockReferralInScheduling,
  };

  const schedulerUser: AuthTokenPayload = {
    userId: 'scheduler-1',
    email: 'scheduler@heals.com',
    roles: [UserRole.SCHEDULER],
    scopes: { sites: ['FL-ORLANDO'], states: ['FL'], legalEntities: [] },
    sessionId: 'sess-sched',
    iat: 1,
    exp: 999999,
  };

  const gaSchedulerUser: AuthTokenPayload = {
    userId: 'scheduler-ga',
    email: 'ga.sched@heals.com',
    roles: [UserRole.SCHEDULER],
    scopes: { sites: ['GA-ATLANTA'], states: ['GA'], legalEntities: [] },
    sessionId: 'sess-ga',
    iat: 1,
    exp: 999999,
  };

  beforeEach(async () => {
    prisma = {
      referral: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
      appointment: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      workflowTransition: {
        create: jest.fn(),
      },
      $transaction: jest.fn((cb) => cb(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<AppointmentsService>(AppointmentsService);
  });

  describe('bookAppointment', () => {
    it('should throw NotFoundException if referral not found', async () => {
      prisma.referral.findUnique.mockResolvedValue(null);

      await expect(
        service.bookAppointment(
          {
            referralId: 'unknown-ref',
            scheduledDate: '2026-11-05',
            scheduledTime: '10:00 AM',
            nursePractitionerId: mockNpUser.id,
          },
          schedulerUser,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user lacks location scope for referral', async () => {
      prisma.referral.findUnique.mockResolvedValue(mockReferralInScheduling); // FL referral

      await expect(
        service.bookAppointment(
          {
            referralId: mockReferralInScheduling.id,
            scheduledDate: '2026-11-05',
            scheduledTime: '10:00 AM',
            nursePractitionerId: mockNpUser.id,
          },
          gaSchedulerUser, // Only GA authorized
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException if assigned user is not an active Nurse Practitioner', async () => {
      prisma.referral.findUnique.mockResolvedValue(mockReferralInScheduling);
      prisma.user.findUnique.mockResolvedValue({
        ...mockNpUser,
        userRoles: [{ role: UserRole.INTAKE_SPECIALIST }], // Not an NP
      });

      await expect(
        service.bookAppointment(
          {
            referralId: mockReferralInScheduling.id,
            scheduledDate: '2026-11-05',
            scheduledTime: '10:00 AM',
            nursePractitionerId: mockNpUser.id,
          },
          schedulerUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should book appointment and update referral status to IN_PROGRESS', async () => {
      prisma.referral.findUnique.mockResolvedValue(mockReferralInScheduling);
      prisma.user.findUnique.mockResolvedValue(mockNpUser);
      prisma.appointment.create.mockResolvedValue(mockAppointment);
      prisma.referral.update.mockResolvedValue(mockReferralInScheduling);

      const res = await service.bookAppointment(
        {
          referralId: mockReferralInScheduling.id,
          scheduledDate: '2026-11-05',
          scheduledTime: '10:00 AM',
          nursePractitionerId: mockNpUser.id,
        },
        schedulerUser,
      );

      expect(res.id).toBe(mockAppointment.id);
      expect(prisma.appointment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            referralId: mockReferralInScheduling.id,
            nursePractitionerId: mockNpUser.id,
          }),
        }),
      );
      expect(prisma.referral.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockReferralInScheduling.id },
          data: expect.objectContaining({
            workStatus: WorkStatus.IN_PROGRESS,
            assignedTo: mockNpUser.id,
          }),
        }),
      );
    });
  });

  describe('confirmAppointment', () => {
    it('should confirm appointment and advance referral to NP_VISIT stage', async () => {
      prisma.appointment.findUnique.mockResolvedValue(mockAppointment);
      prisma.appointment.update.mockResolvedValue({
        ...mockAppointment,
        confirmedAt: new Date(),
        confirmedBy: schedulerUser.userId,
      });
      prisma.referral.update.mockResolvedValue({
        ...mockReferralInScheduling,
        pipelineStage: PipelineStage.NP_VISIT,
        workStatus: WorkStatus.PENDING,
        version: 2,
      });

      const res = await service.confirmAppointment(mockAppointment.id, {}, schedulerUser);

      expect(res.appointment.confirmedAt).toBeDefined();
      expect(prisma.referral.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockAppointment.referralId },
          data: expect.objectContaining({
            pipelineStage: PipelineStage.NP_VISIT,
            workStatus: WorkStatus.PENDING,
            assignedTo: mockAppointment.nursePractitionerId,
          }),
        }),
      );
      expect(prisma.workflowTransition.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            toStage: PipelineStage.NP_VISIT,
          }),
        }),
      );
    });

    it('should reject confirmation if appointment was cancelled', async () => {
      prisma.appointment.findUnique.mockResolvedValue({
        ...mockAppointment,
        cancelledAt: new Date(),
      });

      await expect(
        service.confirmAppointment(mockAppointment.id, {}, schedulerUser),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('cancelAppointment', () => {
    it('should mark appointment cancelled and place referral on hold', async () => {
      prisma.appointment.findUnique.mockResolvedValue(mockAppointment);
      prisma.appointment.update.mockResolvedValue({
        ...mockAppointment,
        cancelledAt: new Date(),
        cancellationReason: 'Patient unavailable',
      });

      const res = await service.cancelAppointment(
        mockAppointment.id,
        { reason: 'Patient unavailable' },
        schedulerUser,
      );

      expect(res.cancelledAt).toBeDefined();
      expect(prisma.referral.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockAppointment.referralId },
          data: expect.objectContaining({
            workStatus: WorkStatus.ON_HOLD,
          }),
        }),
      );
    });
  });

  describe('rescheduleAppointment', () => {
    it('should cancel previous appointment and create new linked appointment', async () => {
      prisma.appointment.findUnique.mockResolvedValue(mockAppointment);
      prisma.appointment.update.mockResolvedValue({});
      prisma.appointment.create.mockResolvedValue({
        ...mockAppointment,
        id: 'appt-002',
        rescheduledFromId: mockAppointment.id,
      });

      const res = await service.rescheduleAppointment(
        mockAppointment.id,
        {
          newScheduledDate: '2026-11-12',
          newScheduledTime: '02:00 PM',
          reason: 'Patient requested afternoon time',
        },
        schedulerUser,
      );

      expect(res.id).toBe('appt-002');
      expect(res.rescheduledFromId).toBe(mockAppointment.id);
      expect(prisma.appointment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockAppointment.id },
          data: expect.objectContaining({
            cancelledAt: expect.any(Date),
          }),
        }),
      );
    });
  });

  describe('findAll', () => {
    it('should return paginated appointments', async () => {
      prisma.appointment.count.mockResolvedValue(1);
      prisma.appointment.findMany.mockResolvedValue([mockAppointment]);

      const res = await service.findAll({ page: 1, limit: 10 }, schedulerUser);

      expect(res.total).toBe(1);
      expect(res.data).toHaveLength(1);
    });
  });

  describe('findById', () => {
    it('should return appointment by ID', async () => {
      prisma.appointment.findUnique.mockResolvedValue(mockAppointment);

      const res = await service.findById(mockAppointment.id, schedulerUser);
      expect(res.id).toBe(mockAppointment.id);
    });
  });
});
