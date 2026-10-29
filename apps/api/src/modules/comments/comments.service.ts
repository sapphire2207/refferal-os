import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthTokenPayload, UserRole, AuditAction } from '@heals/types';
import { CreateCommentDto } from './dto/comments.dto';

@Injectable()
export class CommentsService {
  private readonly logger = new Logger(CommentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Scope verification against parent referral location attributes.
   */
  private checkScope(user: AuthTokenPayload, referral: any) {
    const isAdmin = user.roles?.some(
      (r) => r === UserRole.ADMIN || r === UserRole.COMPLIANCE,
    );
    if (isAdmin) return;

    const allowedStates = user.scopes?.states || [];
    const allowedSites = user.scopes?.sites || [];
    const allowedEntities = user.scopes?.legalEntities || [];

    if (
      allowedStates.length === 0 &&
      allowedSites.length === 0 &&
      allowedEntities.length === 0
    ) {
      throw new ForbiddenException(
        'Access denied: You do not have an assigned location or territory scope.',
      );
    }

    const stateMatch = !referral.state || allowedStates.includes(referral.state);
    const siteMatch = !referral.site || allowedSites.includes(referral.site);
    const entityMatch =
      !referral.legalEntity || allowedEntities.includes(referral.legalEntity);

    if (!stateMatch || !siteMatch || !entityMatch) {
      throw new ForbiddenException(
        'Access to comments for this referral is restricted by your assigned location scope.',
      );
    }
  }

  /**
   * Retrieves all internal comments for a given referral in chronological order.
   */
  async getComments(referralId: string, user: AuthTokenPayload) {
    const referral = await this.prisma.referral.findUnique({
      where: { id: referralId },
    });

    if (!referral) {
      throw new NotFoundException(`Referral ${referralId} not found.`);
    }

    this.checkScope(user, referral);

    const comments = await this.prisma.comment.findMany({
      where: { referralId },
      orderBy: { createdAt: 'asc' },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            userRoles: {
              select: { role: true },
            },
          },
        },
      },
    });

    return comments.map((c: any) => ({
      id: c.id,
      referralId: c.referralId,
      userId: c.userId,
      content: c.content,
      mentions: c.mentions,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      author: {
        id: c.user?.id,
        name: c.user ? `${c.user.firstName} ${c.user.lastName}`.trim() : 'Unknown',
        email: c.user?.email,
        roles: c.user?.userRoles ? c.user.userRoles.map((ur: any) => ur.role) : [],
      },
    }));
  }

  /**
   * Adds an internal comment to a referral.
   */
  async createComment(
    referralId: string,
    dto: CreateCommentDto,
    user: AuthTokenPayload,
  ) {
    const referral = await this.prisma.referral.findUnique({
      where: { id: referralId },
    });

    if (!referral) {
      throw new NotFoundException(`Referral ${referralId} not found.`);
    }

    this.checkScope(user, referral);

    const comment: any = await this.prisma.comment.create({
      data: {
        referralId,
        userId: user.userId,
        content: dto.content.trim(),
        mentions: dto.mentions || [],
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            userRoles: {
              select: { role: true },
            },
          },
        },
      },
    });

    // Audit log comment creation
    await this.auditService.recordEvent(
      user.userId,
      AuditAction.CREATE,
      'COMMENT',
      comment.id,
      undefined,
      undefined,
      {
        referralId,
        contentSnippet: dto.content.slice(0, 50),
      },
    );

    this.logger.log(
      `Created comment ${comment.id} on referral ${referralId} by user ${user.userId}`,
    );

    return {
      id: comment.id,
      referralId: comment.referralId,
      userId: comment.userId,
      content: comment.content,
      mentions: comment.mentions,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
      author: {
        id: comment.user?.id,
        name: comment.user ? `${comment.user.firstName} ${comment.user.lastName}`.trim() : 'Unknown',
        email: comment.user?.email,
        roles: comment.user?.userRoles ? comment.user.userRoles.map((ur: any) => ur.role) : [],
      },
    };
  }
}

