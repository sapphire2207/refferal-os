import {
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { NotificationType } from '@prisma/client';
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

    let [total, unreadCount, data] = await Promise.all([
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId, read: false } }),
      this.prisma.notification.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    if (total === 0 && !query.unreadOnly) {
      const transitions = await this.prisma.workflowTransition.findMany({
        take: 6,
        orderBy: { transitionedAt: 'desc' },
        include: { referral: { include: { patient: true } } },
      });

      if (transitions.length > 0) {
        const seeded = await Promise.all(
          transitions.map((t) => {
            const patientName = t.referral?.patient
              ? `${t.referral.patient.firstName} ${t.referral.patient.lastName}`
              : 'Patient';
            const tracking = `REF-${t.referralId.slice(0, 8).toUpperCase()}`;
            return this.prisma.notification.create({
              data: {
                userId,
                type: NotificationType.REVIEW_REQUIRED,
                title: `Referral ${tracking} moved to ${t.toStage}`,
                message: `${patientName} transitioned from ${t.fromStage || 'INTAKE'} to ${t.toStage}. Reason: ${t.reason || 'Authoritative stage advancement'}.`,
                referralId: t.referralId,
                read: false,
                createdAt: t.transitionedAt,
              },
            });
          }),
        );
        return {
          data: seeded,
          total: seeded.length,
          unreadCount: seeded.length,
          page: 1,
          limit,
          totalPages: 1,
        };
      }

      const referrals = await this.prisma.referral.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: { patient: true },
      });

      if (referrals.length > 0) {
        const seeded = await Promise.all(
          referrals.map((r) => {
            const patientName = r.patient
              ? `${r.patient.firstName} ${r.patient.lastName}`
              : 'Patient';
            const tracking = `REF-${r.id.slice(0, 8).toUpperCase()}`;
            return this.prisma.notification.create({
              data: {
                userId,
                type: NotificationType.ASSIGNMENT,
                title: `Referral ${tracking} active in ${r.pipelineStage}`,
                message: `${patientName}'s clinical case is currently active in ${r.pipelineStage} (${r.workStatus}).`,
                referralId: r.id,
                read: false,
                createdAt: r.createdAt,
              },
            });
          }),
        );
        return {
          data: seeded,
          total: seeded.length,
          unreadCount: seeded.length,
          page: 1,
          limit,
          totalPages: 1,
        };
      }
    }

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
