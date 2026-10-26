import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../../database/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { NotificationType } from '@heals/types';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let prisma: any;
  let redis: any;

  const mockNotification = {
    id: 'notif-001',
    userId: 'user-001',
    type: NotificationType.ASSIGNMENT,
    title: 'New Referral',
    message: 'Referral assigned to you',
    referralId: 'ref-001',
    read: false,
    readAt: null,
    createdAt: new Date('2026-01-01'),
  };

  beforeEach(async () => {
    prisma = {
      notification: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };

    redis = {
      publish: jest.fn().mockResolvedValue(1),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  describe('sendNotification', () => {
    it('should create notification and publish to Redis', async () => {
      prisma.notification.create.mockResolvedValue(mockNotification);

      const res = await service.sendNotification({
        userId: 'user-001',
        type: NotificationType.ASSIGNMENT,
        title: 'New Referral',
        message: 'Referral assigned to you',
        referralId: 'ref-001',
      });

      expect(res.id).toBe(mockNotification.id);
      expect(prisma.notification.create).toHaveBeenCalled();
      expect(redis.publish).toHaveBeenCalledWith(
        'user:user-001:notifications',
        expect.any(String),
      );
    });
  });

  describe('getUserNotifications', () => {
    it('should return paginated notifications and unread count', async () => {
      prisma.notification.count.mockResolvedValue(1);
      prisma.notification.findMany.mockResolvedValue([mockNotification]);

      const res = await service.getUserNotifications('user-001', { page: 1, limit: 10 });

      expect(res.total).toBe(1);
      expect(res.unreadCount).toBe(1);
      expect(res.data).toHaveLength(1);
    });
  });

  describe('markAsRead', () => {
    it('should mark single notification as read', async () => {
      prisma.notification.findUnique.mockResolvedValue(mockNotification);
      prisma.notification.update.mockResolvedValue({
        ...mockNotification,
        read: true,
        readAt: new Date(),
      });

      const res = await service.markAsRead(mockNotification.id, 'user-001');
      expect(res.read).toBe(true);
      expect(prisma.notification.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockNotification.id },
          data: expect.objectContaining({ read: true }),
        }),
      );
    });

    it('should throw NotFoundException if notification does not belong to user', async () => {
      prisma.notification.findUnique.mockResolvedValue({
        ...mockNotification,
        userId: 'other-user',
      });

      await expect(service.markAsRead(mockNotification.id, 'user-001')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('markAllAsRead', () => {
    it('should mark all unread notifications read for user', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 5 });

      const res = await service.markAllAsRead('user-001');
      expect(res.success).toBe(true);
      expect(res.markedCount).toBe(5);
    });
  });

  describe('getUnreadCount', () => {
    it('should return unread count', async () => {
      prisma.notification.count.mockResolvedValue(3);

      const res = await service.getUnreadCount('user-001');
      expect(res.unreadCount).toBe(3);
    });
  });
});
