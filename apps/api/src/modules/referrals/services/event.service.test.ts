import { Test, TestingModule } from '@nestjs/testing';
import { EventService } from './event.service';
import { PrismaService } from '../../../database/prisma.service';
import { EventOutboxStatus } from '@prisma/client';

describe('EventService', () => {
  let service: EventService;
  let prismaService: jest.Mocked<PrismaService>;

  const mockPrismaService = {
    eventOutbox: {
      create: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<EventService>(EventService);
    prismaService = module.get(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('enqueueEvent', () => {
    it('should insert an event into EventOutbox with PENDING status and generated UUID', async () => {
      const mockCreated = {
        id: 'outbox-1',
        eventId: 'event-uuid-1',
        eventType: 'referral.stage.changed',
        aggregateId: 'ref-123',
        payload: { fromStage: 'INTAKE', toStage: 'CLINICAL_REVIEW' },
        status: EventOutboxStatus.PENDING,
        retryCount: 0,
        createdAt: new Date(),
        publishedAt: null,
        lastAttemptAt: null,
      };

      (mockPrismaService.eventOutbox.create as jest.Mock).mockResolvedValue(
        mockCreated,
      );

      const result = await service.enqueueEvent(
        'referral.stage.changed',
        'ref-123',
        { fromStage: 'INTAKE', toStage: 'CLINICAL_REVIEW' },
      );

      expect(mockPrismaService.eventOutbox.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: 'referral.stage.changed',
            aggregateId: 'ref-123',
            status: EventOutboxStatus.PENDING,
            retryCount: 0,
          }),
        }),
      );
      expect(result).toEqual(mockCreated);
    });

    it('should use provided transaction client when tx is supplied', async () => {
      const mockTx = {
        eventOutbox: {
          create: jest.fn().mockResolvedValue({ id: 'tx-outbox-1' }),
        },
      } as any;

      await service.enqueueEvent(
        'referral.assigned',
        'ref-123',
        { newAssignee: { role: 'CLINICAL_REVIEWER' } },
        mockTx,
      );

      expect(mockTx.eventOutbox.create).toHaveBeenCalled();
      expect(mockPrismaService.eventOutbox.create).not.toHaveBeenCalled();
    });
  });

  describe('processOutbox', () => {
    it('should process pending events and mark them PUBLISHED on success', async () => {
      const pendingEvents = [
        {
          id: 'outbox-1',
          eventId: 'uuid-1',
          eventType: 'referral.stage.changed',
          aggregateId: 'ref-1',
          payload: { fromStage: 'INTAKE', toStage: 'CLINICAL_REVIEW' },
          status: EventOutboxStatus.PENDING,
          retryCount: 0,
          createdAt: new Date(),
        },
        {
          id: 'outbox-2',
          eventId: 'uuid-2',
          eventType: 'referral.assigned',
          aggregateId: 'ref-2',
          payload: { newAssignee: { role: 'SCHEDULER' } },
          status: EventOutboxStatus.PENDING,
          retryCount: 1,
          createdAt: new Date(),
        },
      ];

      (mockPrismaService.eventOutbox.findMany as jest.Mock).mockResolvedValue(
        pendingEvents,
      );
      (mockPrismaService.eventOutbox.update as jest.Mock).mockResolvedValue({});

      const stats = await service.processOutbox(10);

      expect(mockPrismaService.eventOutbox.findMany).toHaveBeenCalledWith({
        where: { status: EventOutboxStatus.PENDING },
        orderBy: { createdAt: 'asc' },
        take: 10,
      });

      expect(mockPrismaService.eventOutbox.update).toHaveBeenCalledTimes(2);
      expect(mockPrismaService.eventOutbox.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'outbox-1' },
          data: expect.objectContaining({
            status: EventOutboxStatus.PUBLISHED,
          }),
        }),
      );
      expect(stats).toEqual({
        processed: 2,
        succeeded: 2,
        failed: 0,
      });
    });

    it('should increment retryCount and update lastAttemptAt on failure', async () => {
      const event = {
        id: 'outbox-fail',
        eventId: 'uuid-fail',
        eventType: 'referral.stage.changed',
        aggregateId: 'ref-fail',
        payload: {},
        status: EventOutboxStatus.PENDING,
        retryCount: 1,
        createdAt: new Date(),
      };

      (mockPrismaService.eventOutbox.findMany as jest.Mock).mockResolvedValue([
        event,
      ]);
      jest.spyOn(service, 'publishEvent').mockRejectedValueOnce(new Error('Network error'));
      (mockPrismaService.eventOutbox.update as jest.Mock).mockResolvedValue({});

      const stats = await service.processOutbox();

      expect(mockPrismaService.eventOutbox.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'outbox-fail' },
          data: expect.objectContaining({
            retryCount: 2,
            status: EventOutboxStatus.PENDING,
          }),
        }),
      );
      expect(stats.failed).toBe(1);
    });

    it('should mark event as FAILED when max retries (5) is reached', async () => {
      const event = {
        id: 'outbox-dead-letter',
        eventId: 'uuid-dead',
        eventType: 'referral.stage.changed',
        aggregateId: 'ref-dead',
        payload: {},
        status: EventOutboxStatus.PENDING,
        retryCount: 4, // 5th attempt will fail
        createdAt: new Date(),
      };

      (mockPrismaService.eventOutbox.findMany as jest.Mock).mockResolvedValue([
        event,
      ]);
      jest.spyOn(service, 'publishEvent').mockRejectedValueOnce(new Error('Persistent error'));
      (mockPrismaService.eventOutbox.update as jest.Mock).mockResolvedValue({});

      const stats = await service.processOutbox();

      expect(mockPrismaService.eventOutbox.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'outbox-dead-letter' },
          data: expect.objectContaining({
            retryCount: 5,
            status: EventOutboxStatus.FAILED,
          }),
        }),
      );
      expect(stats.failed).toBe(1);
    });
  });

  describe('emitter helper methods', () => {
    it('should execute emitStageChanged without error', async () => {
      await expect(
        service.emitStageChanged('ref-1', 'INTAKE', 'CLINICAL_REVIEW'),
      ).resolves.not.toThrow();
    });

    it('should execute emitAssignment without error', async () => {
      await expect(
        service.emitAssignment('ref-1', null, { role: 'SCHEDULER' }),
      ).resolves.not.toThrow();
    });

    it('should execute emitWorkStatusChanged without error', async () => {
      await expect(
        service.emitWorkStatusChanged('ref-1', 'PENDING', 'IN_PROGRESS'),
      ).resolves.not.toThrow();
    });
  });
});
