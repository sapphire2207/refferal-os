import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import {
  QueryAuditLogsDto,
  AuditAction,
} from './dto/audit.dto';
import { AuthTokenPayload, UserRole } from '@heals/types';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Centralized method to record an audit trail event.
   */
  async recordEvent(
    userId: string,
    action: AuditAction | string,
    entityType: string,
    entityId: string,
    before?: any,
    after?: any,
    metadata?: any,
    ipAddress?: string,
    userAgent?: string,
  ) {
    try {
      const event = await this.prisma.auditEvent.create({
        data: {
          userId,
          action: action as any,
          entityType,
          entityId,
          before: before || undefined,
          after: after || undefined,
          metadata: metadata || undefined,
          ipAddress: ipAddress || null,
          userAgent: userAgent || null,
        },
      });

      return event;
    } catch (err: any) {
      this.logger.error(`Failed to record audit event for ${entityType} ${entityId}: ${err.message}`);
      return null;
    }
  }

  /**
   * Specifically logs access, viewing, or exporting of Protected Health Information (PHI).
   */
  async logPhiAccess(
    userId: string,
    entityType: string,
    entityId: string,
    reason: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    return this.recordEvent(
      userId,
      AuditAction.VIEW,
      entityType,
      entityId,
      undefined,
      undefined,
      { accessType: 'PHI_ACCESS', reason },
      ipAddress,
      userAgent,
    );
  }

  /**
   * Queries audit logs with pagination and filters. Restricted to ADMIN and COMPLIANCE.
   */
  async queryLogs(query: QueryAuditLogsDto, user: AuthTokenPayload) {
    const isAuthorized = user.roles?.some(
      (r) => r === UserRole.ADMIN || r === UserRole.COMPLIANCE,
    );
    if (!isAuthorized) {
      throw new ForbiddenException('Audit trail inspection is restricted to Admin and Compliance roles.');
    }

    const page = query.page && query.page > 0 ? Number(query.page) : 1;
    const limit = query.limit && query.limit > 0 ? Number(query.limit) : 50;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.userId) {
      where.userId = query.userId;
    }

    if (query.action) {
      where.action = query.action;
    }

    if (query.entityType) {
      where.entityType = { equals: query.entityType, mode: 'insensitive' };
    }

    if (query.entityId) {
      where.entityId = query.entityId;
    }

    if (query.startDate || query.endDate) {
      where.timestamp = {
        ...(query.startDate && { gte: new Date(query.startDate) }),
        ...(query.endDate && { lte: new Date(query.endDate) }),
      };
    }

    const [total, data] = await Promise.all([
      this.prisma.auditEvent.count({ where }),
      this.prisma.auditEvent.findMany({
        where,
        skip,
        take: limit,
        orderBy: { timestamp: 'desc' },
        include: {
          user: {
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
   * Retrieves single audit record by ID.
   */
  async findById(id: string, user: AuthTokenPayload) {
    const isAuthorized = user.roles?.some(
      (r) => r === UserRole.ADMIN || r === UserRole.COMPLIANCE,
    );
    if (!isAuthorized) {
      throw new ForbiddenException('Audit trail inspection is restricted to Admin and Compliance roles.');
    }

    const event = await this.prisma.auditEvent.findUnique({
      where: { id },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    if (!event) {
      throw new NotFoundException(`Audit event ${id} not found.`);
    }

    return event;
  }
}
