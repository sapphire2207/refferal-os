import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../database/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { AuthService } from '../auth/auth.service';
import { EmailService } from '../../common/email/email.service';
import {
  CreateUserInviteDto,
  UpdateUserRolesDto,
  UpdateUserScopesDto,
  UpdateUserStatusDto,
  UpdateUserProfileDto,
  QueryUsersDto,
} from './dto/users.dto';
import { UserRole } from '@heals/types';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    @Inject(forwardRef(() => AuthService))
    private readonly authService: AuthService,
    private readonly emailService: EmailService,
  ) {}

  /**
   * Safe projection excluding cryptographic and authentication secrets.
   */
  private sanitizeUser(user: any) {
    if (!user) return null;
    const {
      passwordHash,
      mfaSecret,
      mfaRecoveryCodes,
      invitationToken,
      passwordResetToken,
      ...safeUser
    } = user;

    return {
      ...safeUser,
      roles: user.userRoles ? user.userRoles.map((ur: any) => ur.role) : [],
      scopes: user.userScopes || [],
    };
  }

  /**
   * Retrieves a paginated list of users with multi-dimensional filtering.
   */
  async findAll(query: QueryUsersDto) {
    const page = query.page && query.page > 0 ? Number(query.page) : 1;
    const limit = query.limit && query.limit > 0 ? Number(query.limit) : 20;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.search) {
      where.OR = [
        { email: { contains: query.search, mode: 'insensitive' } },
        { firstName: { contains: query.search, mode: 'insensitive' } },
        { lastName: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.role) {
      where.userRoles = {
        some: {
          role: query.role,
        },
      };
    }

    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    if (query.isSuspended !== undefined) {
      where.isSuspended = query.isSuspended;
    }

    if (query.site || query.state || query.legalEntity) {
      where.userScopes = {
        some: {
          ...(query.site && { site: query.site }),
          ...(query.state && { state: query.state }),
          ...(query.legalEntity && { legalEntity: query.legalEntity }),
        },
      };
    }

    const [total, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          userRoles: true,
          userScopes: true,
        },
      }),
    ]);

    return {
      data: users.map((u) => this.sanitizeUser(u)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Retrieves user by unique ID with roles and location scopes.
   */
  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        userRoles: true,
        userScopes: true,
      },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return this.sanitizeUser(user);
  }

  /**
   * Invites a new user into the platform.
   * Generates a 7-day cryptographic invitation token and sets assigned roles & scopes.
   */
  async inviteUser(dto: CreateUserInviteDto, adminUserId?: string) {
    const email = dto.email.toLowerCase().trim();

    const existingUser = await this.prisma.user.findUnique({
      where: { email },
      include: { userRoles: true, userScopes: true },
    });

    if (existingUser && existingUser.isActive) {
      throw new ConflictException(`User with email ${email} already exists and is active`);
    }

    const invitationToken = crypto.randomBytes(32).toString('hex');
    const hashedInvitationToken = crypto.createHash('sha256').update(invitationToken).digest('hex');
    const invitationExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    const placeholderHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);

    if (existingUser && !existingUser.isActive) {
      // Re-invite pending inactive user: refresh token, roles, and scopes
      await this.prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: existingUser.id },
          data: {
            firstName: dto.firstName,
            lastName: dto.lastName,
            invitationToken: hashedInvitationToken,
            invitationExpiresAt,
          },
        });

        await tx.userRoleAssignment.deleteMany({ where: { userId: existingUser.id } });
        if (dto.roles?.length) {
          await tx.userRoleAssignment.createMany({
            data: dto.roles.map((role) => ({
              userId: existingUser.id,
              role,
              grantedBy: adminUserId || null,
            })),
          });
        }

        await tx.userScope.deleteMany({ where: { userId: existingUser.id } });
        if (dto.scopes?.length) {
          await tx.userScope.createMany({
            data: dto.scopes.map((scope) => ({
              userId: existingUser.id,
              site: scope.site || null,
              state: scope.state || null,
              legalEntity: scope.legalEntity || null,
            })),
          });
        }
      });

      this.logger.log(`Refreshed invitation for existing inactive user ${email}`);

      // Send invitation email (non-blocking — log failure but don't fail the request)
      const primaryRole = dto.roles?.[0] ?? 'STAFF';
      this.emailService
        .sendInvitationEmail({
          to: email,
          firstName: dto.firstName,
          lastName: dto.lastName,
          role: primaryRole,
          invitationToken,
          expiresAt: invitationExpiresAt,
        })
        .catch((err) => this.logger.error(`Failed to send re-invite email to ${email}: ${err.message}`));

      return {
        id: existingUser.id,
        email,
        firstName: dto.firstName,
        lastName: dto.lastName,
        invitationToken,
        invitationExpiresAt,
        roles: dto.roles,
        scopes: dto.scopes || [],
      };
    }

    // Create new invited user
    const newUser = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email,
          firstName: dto.firstName,
          lastName: dto.lastName,
          passwordHash: placeholderHash,
          isActive: false,
          isSuspended: false,
          invitationToken: hashedInvitationToken,
          invitationExpiresAt,
        },
      });

      if (dto.roles?.length) {
        await tx.userRoleAssignment.createMany({
          data: dto.roles.map((role) => ({
            userId: created.id,
            role,
            grantedBy: adminUserId || null,
          })),
        });
      }

      if (dto.scopes?.length) {
        await tx.userScope.createMany({
          data: dto.scopes.map((scope) => ({
            userId: created.id,
            site: scope.site || null,
            state: scope.state || null,
            legalEntity: scope.legalEntity || null,
          })),
        });
      }

      return created;
    });

    this.logger.log(`Invited new user ${email} (ID: ${newUser.id})`);

    // Send invitation email (non-blocking)
    const primaryRole = dto.roles?.[0] ?? 'STAFF';
    this.emailService
      .sendInvitationEmail({
        to: email,
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: primaryRole,
        invitationToken,
        expiresAt: invitationExpiresAt,
      })
      .catch((err) => this.logger.error(`Failed to send invite email to ${email}: ${err.message}`));

    return {
      id: newUser.id,
      email,
      firstName: dto.firstName,
      lastName: dto.lastName,
      invitationToken,
      invitationExpiresAt,
      roles: dto.roles,
      scopes: dto.scopes || [],
    };
  }

  /**
   * Updates assigned roles for a user.
   * Atomically replaces roles and clears cached permissions.
   */
  async updateRoles(id: string, dto: UpdateUserRolesDto, adminUserId?: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.userRoleAssignment.deleteMany({ where: { userId: id } });
      if (dto.roles.length > 0) {
        await tx.userRoleAssignment.createMany({
          data: dto.roles.map((role) => ({
            userId: id,
            role,
            grantedBy: adminUserId || null,
          })),
        });
      }
    });

    // Invalidate Redis permissions cache so role changes take effect immediately
    await this.redis.del(`user:permissions:${id}`);
    await this.redis.del(`user:${id}:permissions`);

    this.logger.log(`Updated roles for user ${id}: [${dto.roles.join(', ')}]`);

    return this.findById(id);
  }

  /**
   * Updates location/legal entity scopes for a user.
   */
  async updateScopes(id: string, dto: UpdateUserScopesDto, adminUserId?: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.userScope.deleteMany({ where: { userId: id } });
      if (dto.scopes.length > 0) {
        await tx.userScope.createMany({
          data: dto.scopes.map((scope) => ({
            userId: id,
            site: scope.site || null,
            state: scope.state || null,
            legalEntity: scope.legalEntity || null,
          })),
        });
      }
    });

    // Invalidate cached scopes in Redis
    await this.redis.del(`user:scopes:${id}`);

    this.logger.log(`Updated scopes for user ${id}: ${dto.scopes.length} scope entries`);

    return this.findById(id);
  }

  /**
   * Updates account status (activation, suspension, reason).
   * If suspended or deactivated, immediately terminates all active sessions.
   */
  async updateStatus(id: string, dto: UpdateUserStatusDto, adminUserId?: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.isSuspended !== undefined && { isSuspended: dto.isSuspended }),
        ...(dto.suspendedReason !== undefined && { suspendedReason: dto.suspendedReason }),
      },
      include: {
        userRoles: true,
        userScopes: true,
      },
    });

    // If deactivated or suspended, revoke all sessions immediately
    if (dto.isActive === false || dto.isSuspended === true) {
      await this.authService.revokeAllUserSessions(id);
      this.logger.warn(
        `User ${id} suspended/deactivated by admin ${adminUserId || 'system'}. Revoked all active sessions.`,
      );
    }

    // Invalidate cached permissions
    await this.redis.del(`user:permissions:${id}`);
    await this.redis.del(`user:${id}:permissions`);

    return this.sanitizeUser(updated);
  }

  /**
   * Updates basic user profile details.
   */
  async updateProfile(id: string, dto: UpdateUserProfileDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.firstName && { firstName: dto.firstName.trim() }),
        ...(dto.lastName && { lastName: dto.lastName.trim() }),
      },
      include: {
        userRoles: true,
        userScopes: true,
      },
    });

    return this.sanitizeUser(updated);
  }

  /**
   * Deactivates a user and terminates all active sessions.
   */
  async deactivateUser(id: string, adminUserId?: string) {
    return this.updateStatus(id, { isActive: false }, adminUserId);
  }

  /**
   * Deletes a user account or cancels a pending invitation.
   * If the user has clinical/audit history (HIPAA retention), soft-deletes and terminates sessions.
   * If the user is a pending invite or has no clinical audit records, hard-deletes the record.
   */
  async deleteUser(id: string, adminUserId?: string) {
    if (adminUserId && adminUserId === id) {
      throw new BadRequestException('You cannot delete your own administrative account');
    }

    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            clinicalReviews: true,
            createdNotes: true,
            signedNotes: true,
            submittedClaims: true,
            auditEvents: true,
            uploadedDocuments: true,
            verifiedDocuments: true,
            assignedEncounters: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    // Always revoke active sessions and permissions
    await this.authService.revokeAllUserSessions(id);
    await this.redis.del(`user:permissions:${id}`);
    await this.redis.del(`user:${id}:permissions`);

    const hasClinicalHistory =
      user._count.clinicalReviews > 0 ||
      user._count.createdNotes > 0 ||
      user._count.signedNotes > 0 ||
      user._count.submittedClaims > 0 ||
      user._count.auditEvents > 0 ||
      user._count.uploadedDocuments > 0 ||
      user._count.verifiedDocuments > 0 ||
      user._count.assignedEncounters > 0;

    if (!hasClinicalHistory) {
      // Safe to completely hard-delete: remove roles, scopes, sessions, notifications, and user record
      await this.prisma.$transaction(async (tx) => {
        await tx.userRoleAssignment.deleteMany({ where: { userId: id } });
        await tx.userScope.deleteMany({ where: { userId: id } });
        await tx.session.deleteMany({ where: { userId: id } });
        await tx.notification.deleteMany({ where: { userId: id } });
        await tx.user.delete({ where: { id } });
      });

      this.logger.log(`User ${user.email} (ID: ${id}) permanently hard-deleted by admin ${adminUserId || 'system'}`);
      return { success: true, message: `User ${user.email} deleted permanently`, deleted: true };
    }

    // If clinical history exists, HIPAA compliance requires retaining the audit trail.
    // Soft-delete: deactivate, suspend, scrub tokens & credentials.
    await this.prisma.user.update({
      where: { id },
      data: {
        isActive: false,
        isSuspended: true,
        suspendedReason: 'Account deleted by administrator (Audit record retained for HIPAA compliance)',
        invitationToken: null,
        invitationExpiresAt: null,
        passwordResetToken: null,
        passwordResetExpiresAt: null,
        mfaSecret: null,
        mfaRecoveryCodes: [],
      },
    });

    this.logger.warn(`User ${user.email} (ID: ${id}) soft-deleted (clinical records retained for HIPAA compliance) by admin ${adminUserId || 'system'}`);
    return { success: true, message: `User ${user.email} deactivated and access revoked (clinical records retained for compliance)`, deleted: true };
  }

  /**
   * Resends an invitation with a refreshed 7-day token.
   */
  async resendInvite(id: string, adminUserId?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { userRoles: true, userScopes: true },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    if (user.isActive) {
      throw new BadRequestException('User has already activated their account');
    }

    const invitationToken = crypto.randomBytes(32).toString('hex');
    const hashedInvitationToken = crypto.createHash('sha256').update(invitationToken).digest('hex');
    const invitationExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await this.prisma.user.update({
      where: { id },
      data: {
        invitationToken: hashedInvitationToken,
        invitationExpiresAt,
      },
    });

    const primaryRole = user.userRoles?.[0]?.role ?? 'STAFF';

    // Non-blocking email dispatch
    this.emailService
      .sendInvitationEmail({
        to: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: primaryRole,
        invitationToken,
        expiresAt: invitationExpiresAt,
      })
      .catch((err) => this.logger.error(`Failed to resend invite to ${user.email}: ${err.message}`));

    this.logger.log(`Resent invitation to ${user.email} (ID: ${id}) by admin ${adminUserId || 'system'}`);
    return { success: true, message: `Invitation resent to ${user.email}` };
  }

  /**
   * Retention Policy: Purges unaccepted invitations that have been expired for more than 30 days.
   * Runs automatically every day at midnight.
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async purgeExpiredInvitations(retentionDays = 30): Promise<{ purgedCount: number }> {
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    const expiredPendingUsers = await this.prisma.user.findMany({
      where: {
        isActive: false,
        invitationExpiresAt: { lt: cutoffDate },
      },
      select: { id: true, email: true },
    });

    if (expiredPendingUsers.length === 0) {
      return { purgedCount: 0 };
    }

    let purgedCount = 0;
    for (const u of expiredPendingUsers) {
      try {
        await this.deleteUser(u.id, 'retention-cleanup-service');
        purgedCount++;
      } catch (err: any) {
        this.logger.error(`Error purging expired invite for user ${u.email}: ${err.message}`);
      }
    }

    this.logger.log(`Retention policy: Purged ${purgedCount} expired unaccepted invitations older than ${retentionDays} days`);
    return { purgedCount };
  }
}
