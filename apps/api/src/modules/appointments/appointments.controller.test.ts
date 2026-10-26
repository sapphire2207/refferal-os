import { Test, TestingModule } from '@nestjs/testing';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';
import { UserRole, AuthTokenPayload } from '@heals/types';

describe('AppointmentsController', () => {
  let controller: AppointmentsController;
  let service: any;

  const mockScheduler: AuthTokenPayload = {
    userId: 'scheduler-1',
    email: 'scheduler@heals.com',
    roles: [UserRole.SCHEDULER],
    scopes: { sites: [], states: [], legalEntities: [] },
    sessionId: 'sess-sched',
    iat: 1,
    exp: 999999,
  };

  beforeEach(async () => {
    service = {
      bookAppointment: jest.fn().mockResolvedValue({ id: 'appt-1' }),
      findAll: jest.fn().mockResolvedValue({ data: [], total: 0 }),
      findById: jest.fn().mockResolvedValue({ id: 'appt-1' }),
      confirmAppointment: jest.fn().mockResolvedValue({ appointment: { id: 'appt-1' } }),
      cancelAppointment: jest.fn().mockResolvedValue({ id: 'appt-1' }),
      rescheduleAppointment: jest.fn().mockResolvedValue({ id: 'appt-2' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppointmentsController],
      providers: [
        { provide: AppointmentsService, useValue: service },
      ],
    }).compile();

    controller = module.get<AppointmentsController>(AppointmentsController);
  });

  describe('bookAppointment', () => {
    it('should book appointment', async () => {
      const dto = {
        referralId: 'ref-1',
        scheduledDate: '2026-11-05',
        scheduledTime: '10:00 AM',
        nursePractitionerId: 'np-1',
      };

      const res = await controller.bookAppointment(dto, mockScheduler);
      expect(service.bookAppointment).toHaveBeenCalledWith(dto, mockScheduler);
      expect(res.id).toBe('appt-1');
    });
  });

  describe('findAll', () => {
    it('should query appointments', async () => {
      const res = await controller.findAll({ page: 1, limit: 10 }, mockScheduler);
      expect(service.findAll).toHaveBeenCalledWith({ page: 1, limit: 10 }, mockScheduler);
      expect(res.data).toEqual([]);
    });
  });

  describe('findById', () => {
    it('should retrieve appointment by ID', async () => {
      const res = await controller.findById('appt-1', mockScheduler);
      expect(service.findById).toHaveBeenCalledWith('appt-1', mockScheduler);
      expect(res.id).toBe('appt-1');
    });
  });

  describe('confirmAppointment', () => {
    it('should confirm appointment', async () => {
      const res = await controller.confirmAppointment('appt-1', {}, mockScheduler);
      expect(service.confirmAppointment).toHaveBeenCalledWith('appt-1', {}, mockScheduler);
      expect(res.appointment.id).toBe('appt-1');
    });
  });

  describe('cancelAppointment', () => {
    it('should cancel appointment', async () => {
      const res = await controller.cancelAppointment('appt-1', { reason: 'Cancelled' }, mockScheduler);
      expect(service.cancelAppointment).toHaveBeenCalledWith('appt-1', { reason: 'Cancelled' }, mockScheduler);
      expect(res.id).toBe('appt-1');
    });
  });

  describe('rescheduleAppointment', () => {
    it('should reschedule appointment', async () => {
      const dto = {
        newScheduledDate: '2026-11-12',
        newScheduledTime: '02:00 PM',
        reason: 'Client requested reschedule',
      };

      const res = await controller.rescheduleAppointment('appt-1', dto, mockScheduler);
      expect(service.rescheduleAppointment).toHaveBeenCalledWith('appt-1', dto, mockScheduler);
      expect(res.id).toBe('appt-2');
    });
  });
});
