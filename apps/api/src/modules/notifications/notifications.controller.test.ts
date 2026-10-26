import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { UserRole, AuthTokenPayload, NotificationType } from '@heals/types';

describe('NotificationsController', () => {
  let controller: NotificationsController;
  let service: any;

  const mockUser: AuthTokenPayload = {
    userId: 'user-1',
    email: 'user@heals.com',
    roles: [UserRole.INTAKE_SPECIALIST],
    scopes: { sites: [], states: [], legalEntities: [] },
    sessionId: 'sess-user',
    iat: 1,
    exp: 999999,
  };

  beforeEach(async () => {
    service = {
      getUserNotifications: jest.fn().mockResolvedValue({ data: [], total: 0 }),
      getUnreadCount: jest.fn().mockResolvedValue({ unreadCount: 2 }),
      markAsRead: jest.fn().mockResolvedValue({ id: 'notif-1', read: true }),
      markAllAsRead: jest.fn().mockResolvedValue({ success: true, markedCount: 5 }),
      sendNotification: jest.fn().mockResolvedValue({ id: 'notif-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [
        { provide: NotificationsService, useValue: service },
      ],
    }).compile();

    controller = module.get<NotificationsController>(NotificationsController);
  });

  describe('getUserNotifications', () => {
    it('should get user notifications', async () => {
      const res = await controller.getUserNotifications({ page: 1, limit: 10 }, mockUser);
      expect(service.getUserNotifications).toHaveBeenCalledWith('user-1', { page: 1, limit: 10 });
      expect(res.data).toEqual([]);
    });
  });

  describe('getUnreadCount', () => {
    it('should get unread count', async () => {
      const res = await controller.getUnreadCount(mockUser);
      expect(service.getUnreadCount).toHaveBeenCalledWith('user-1');
      expect(res.unreadCount).toBe(2);
    });
  });

  describe('markAsRead', () => {
    it('should mark single notification read', async () => {
      const res = await controller.markAsRead('notif-1', mockUser);
      expect(service.markAsRead).toHaveBeenCalledWith('notif-1', 'user-1');
      expect(res.read).toBe(true);
    });
  });

  describe('markAllAsRead', () => {
    it('should mark all notifications read', async () => {
      const res = await controller.markAllAsRead(mockUser);
      expect(service.markAllAsRead).toHaveBeenCalledWith('user-1');
      expect(res.success).toBe(true);
    });
  });

  describe('sendNotification', () => {
    it('should dispatch notification', async () => {
      const dto = {
        userId: 'user-2',
        type: NotificationType.ASSIGNMENT,
        title: 'New Assignment',
        message: 'Assigned to referral',
      };

      const res = await controller.sendNotification(dto);
      expect(service.sendNotification).toHaveBeenCalledWith(dto);
      expect(res.id).toBe('notif-1');
    });
  });
});
