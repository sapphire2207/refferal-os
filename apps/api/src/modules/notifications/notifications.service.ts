import {
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { RedisService } from '../../redis/redis.service';
import {
  SendNotificationDto,
  QueryNotificationsDto,
} from './dto/notifications.dto';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Dispatches and stores an in-app notification.
   */
  async sendNotification(dto: SendNotificationDto) {
    const notification = await this.prisma.notification.create({
      data: {
        userId: dto.userId,
        type: dto.type,
        title: dto.title.trim(),
        message: dto.message.trim(),
        referralId: dto.referralId || null,
      },
    });

    // Publish to Redis channel for real-time WebSocket delivery
    try {
      await this.redis.publish(
        `user:${dto.userId}:notifications`,
        JSON.stringify(notification),
      );
    } catch (err: any) {
      this.logger.warn(`Failed to publish real-time notification to Redis: ${err.message}`);
    }

    this.logger.log(`Created notification ${notification.id} for user ${dto.userId}: ${dto.title}`);
    return notification;
  }

  /**
   * Retrieves paginated notifications for an authenticated user.
   */
  async getUserNotifications(userId: string, query: QueryNotificationsDto) {
    const page = query.page && query.page > 0 ? Number(query.page) : 1;
    const limit = query.limit && query.limit > 0 ? Number(query.limit) : 20;
    const skip = (page - 1) * limit;

    const where: any = { userId };
    if (query.unreadOnly) {
      where.read = false;
    }

    const [total, unreadCount, data] = await Promise.all([
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId, read: false } }),
      this.prisma.notification.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      data,
      total,
      unreadCount,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Marks a notification as read.
   */
  async markAsRead(id: string, userId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
    });

    if (!notification || notification.userId !== userId) {
      throw new NotFoundException(`Notification ${id} not found.`);
    }

    return this.prisma.notification.update({
      where: { id },
      data: {
        read: true,
        readAt: new Date(),
      },
    });
  }

  /**
   * Marks all unread notifications as read for a user.
   */
  async markAllAsRead(userId: string) {
    const now = new Date();
    const result = await this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: {
        read: true,
        readAt: now,
      },
    });

    return {
      success: true,
      markedCount: result.count,
    };
  }

  /**
   * Gets unread notifications count for badge display.
   */
  async getUnreadCount(userId: string) {
    const count = await this.prisma.notification.count({
      where: { userId, read: false },
    });

    return { unreadCount: count };
  }
}
