import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { authenticator } from 'otplib';
import * as QRCode from 'qrcode';
import { PrismaService } from '../../database/prisma.service';


import { RedisService } from '../../redis/redis.service';
import { AuthTokenPayload, UserRole } from '@heals/types';
import { ROLE_PERMISSIONS } from '@heals/constants';
import {
  MfaSetupResponseDto,
  MfaEnableResponseDto,
  PasswordResetRequestDto,
  PasswordResetConfirmDto,
  AcceptInvitationDto,
} from './dto/auth.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Validates user credentials, checking active state, suspension, and password hash.
   */
  async validateUser(email: string, password: string): Promise<any> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: {
        userRoles: true,
        userScopes: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is inactive. Please accept your invitation or contact an administrator.');
    }

    if (user.isSuspended) {
      throw new UnauthorizedException(
        `Account has been suspended: ${user.suspendedReason || 'Please contact security administration.'}`,
      );
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return user;
  }

  /**
   * Primary login handler. If MFA is enabled, returns a temporary MFA ticket instead of full tokens.
   */
  async login(user: any, ipAddress?: string, userAgent?: string) {
    if (user.mfaEnabled) {
      const mfaTicketId = crypto.randomBytes(32).toString('hex');
      // Store temporary ticket in Redis for 5 minutes
      await this.redis.setJson(`mfa:ticket:${mfaTicketId}`, { userId: user.id }, 300);

      this.logger.log(`MFA challenge issued for user ${user.email}`);
      return {
        mfaRequired: true,
        mfaToken: mfaTicketId,
      };
    }

    const sessionData = await this.issueUserSession(user, ipAddress, userAgent);
    return {
      mfaRequired: false,
      ...sessionData,
    };
  }

  /**
   * Issues a validated session with JWT access token and rotated refresh token.
   */
  async issueUserSession(user: any, ipAddress?: string, userAgent?: string) {
    const sessionId = await this.createSession(user.id, ipAddress, userAgent);

    const roles = user.userRoles ? user.userRoles.map((ur: any) => ur.role) : [];
    const scopes = {
      sites: user.userScopes
        ? ([...new Set(user.userScopes.map((us: any) => us.site).filter(Boolean))] as string[])
        : [],
      states: user.userScopes
        ? ([...new Set(user.userScopes.map((us: any) => us.state).filter(Boolean))] as string[])
        : [],
      legalEntities: user.userScopes
        ? ([...new Set(user.userScopes.map((us: any) => us.legalEntity).filter(Boolean))] as string[])
        : [],
    };

    const payload: Omit<AuthTokenPayload, 'iat' | 'exp'> = {
      userId: user.id,
      email: user.email,
      roles,
      scopes,
      sessionId,
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: this.configService.get('JWT_EXPIRATION', '15m'),
    });

    const refreshToken = this.jwtService.sign(
      { userId: user.id, sessionId },
      {
        expiresIn: this.configService.get('REFRESH_TOKEN_EXPIRATION', '7d'),
      },
    );

    // Store active session in Redis with 7-day TTL matching refresh expiration
    await this.redis.setJson(`session:${sessionId}`, payload, 60 * 60 * 24 * 7);

    // Update session record in DB with refresh token hash
    const hashedRefresh = crypto.createHash('sha256').update(refreshToken).digest('hex');
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { refreshToken: hashedRefresh },
    });

    // Update user last login
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    this.logger.log(`Session established for user ${user.email} (session: ${sessionId})`);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        roles,
        scopes,
        mfaEnabled: user.mfaEnabled || false,
      },
    };
  }

  /**
   * Initializes MFA setup for an authenticated user, returning TOTP secret and QR code.
   */
  async setupMfa(userId: string): Promise<MfaSetupResponseDto> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const secret = authenticator.generateSecret();
    const appName = 'Heals on Wheels';
    const otpauthUri = authenticator.keyuri(user.email, appName, secret);
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUri);

    // Store pending MFA secret in Redis for 15 minutes
    await this.redis.setJson(`mfa:setup:${userId}`, { secret }, 900);

    return {
      secret,
      qrCodeDataUrl,
      otpauthUri,
    };
  }

  /**
   * Enables MFA by validating initial TOTP code and generates 8 secure recovery codes.
   */
  async enableMfa(userId: string, code: string): Promise<MfaEnableResponseDto> {
    const setupData = await this.redis.getJson<{ secret: string }>(`mfa:setup:${userId}`);
    if (!setupData?.secret) {
      throw new BadRequestException('MFA setup session expired or not initiated. Please initiate setup again.');
    }

    const isValid = authenticator.check(code, setupData.secret);
    if (!isValid) {
      throw new BadRequestException('Invalid verification code from authenticator app.');
    }

    // Generate 8 random recovery codes (10 hex chars each)
    const recoveryCodes: string[] = [];
    const hashedCodes: string[] = [];
    for (let i = 0; i < 8; i++) {
      const plainCode = crypto.randomBytes(5).toString('hex').toUpperCase();
      recoveryCodes.push(plainCode);
      hashedCodes.push(crypto.createHash('sha256').update(plainCode).digest('hex'));
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        mfaEnabled: true,
        mfaSecret: setupData.secret,
        mfaRecoveryCodes: hashedCodes,
      },
    });

    await this.redis.del(`mfa:setup:${userId}`);
    this.logger.log(`MFA enabled successfully for user ID ${userId}`);

    return {
      enabled: true,
      recoveryCodes,
    };
  }

  /**
   * Verifies MFA ticket and code (TOTP or recovery code) to complete login.
   */
  async verifyMfa(mfaToken: string, code: string, ipAddress?: string, userAgent?: string) {
    const ticket = await this.redis.getJson<{ userId: string }>(`mfa:ticket:${mfaToken}`);
    if (!ticket?.userId) {
      throw new UnauthorizedException('MFA ticket has expired or is invalid. Please log in again.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: ticket.userId },
      include: {
        userRoles: true,
        userScopes: true,
      },
    });

    if (!user || !user.isActive || user.isSuspended || !user.mfaSecret) {
      throw new UnauthorizedException('User account ineligible for MFA verification.');
    }

    // 1. Check TOTP Code
    let verified = false;
    try {
      verified = authenticator.check(code, user.mfaSecret);
    } catch {
      verified = false;
    }

    // 2. Check Recovery Code if TOTP failed
    if (!verified && user.mfaRecoveryCodes && user.mfaRecoveryCodes.length > 0) {
      const hashedInput = crypto.createHash('sha256').update(code.toUpperCase().trim()).digest('hex');
      const codeIndex = user.mfaRecoveryCodes.indexOf(hashedInput);

      if (codeIndex !== -1) {
        verified = true;
        // Remove used recovery code
        const updatedCodes = [...user.mfaRecoveryCodes];
        updatedCodes.splice(codeIndex, 1);
        await this.prisma.user.update({
          where: { id: user.id },
          data: { mfaRecoveryCodes: updatedCodes },
        });
        this.logger.warn(`Recovery code used by user ${user.email}. Remaining codes: ${updatedCodes.length}`);
      }
    }

    if (!verified) {
      throw new UnauthorizedException('Invalid MFA verification code.');
    }

    // Consume ticket
    await this.redis.del(`mfa:ticket:${mfaToken}`);

    // Complete session issuance
    return this.issueUserSession(user, ipAddress, userAgent);
  }

  /**
   * Disables MFA with password and code verification.
   */
  async disableMfa(userId: string, password: string, code: string): Promise<{ enabled: boolean }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid password');
    }

    if (user.mfaSecret) {
      let isValid = false;
      try {
        isValid = authenticator.check(code, user.mfaSecret);
      } catch {
        isValid = false;
      }
      if (!isValid) {
        throw new UnauthorizedException('Invalid verification code');
      }
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        mfaEnabled: false,
        mfaSecret: null,
        mfaRecoveryCodes: [],
      },
    });

    this.logger.log(`MFA disabled for user ID ${userId}`);
    return { enabled: false };
  }

  /**
   * Password reset request. Returns a generic safe response to prevent user enumeration.
   */
  async requestPasswordReset(dto: PasswordResetRequestDto): Promise<{ message: string }> {
    const genericResponse = {
      message: 'If an account exists with this email address, password reset instructions have been sent.',
    };

    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (!user || !user.isActive || user.isSuspended) {
      return genericResponse;
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: hashedToken,
        passwordResetExpiresAt: expiresAt,
      },
    });

    this.logger.log(`Password reset requested for ${user.email}. (Token: ${resetToken})`);
    return genericResponse;
  }

  /**
   * Confirms password reset with token and new password, revoking all existing sessions.
   */
  async confirmPasswordReset(dto: PasswordResetConfirmDto): Promise<{ success: boolean; message: string }> {
    const hashedToken = crypto.createHash('sha256').update(dto.token).digest('hex');

    const user = await this.prisma.user.findFirst({
      where: {
        passwordResetToken: hashedToken,
        passwordResetExpiresAt: { gt: new Date() },
      },
    });

    if (!user) {
      throw new BadRequestException('Password reset token is invalid or has expired.');
    }

    const rounds = parseInt(this.configService.get('BCRYPT_ROUNDS', '12'));
    const passwordHash = await bcrypt.hash(dto.newPassword, rounds);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordResetToken: null,
        passwordResetExpiresAt: null,
      },
    });

    // Revoke all existing sessions across all devices for security
    await this.revokeAllUserSessions(user.id);

    this.logger.log(`Password reset confirmed for user ${user.email}`);
    return {
      success: true,
      message: 'Password has been reset successfully. Please log in with your new password.',
    };
  }

  /**
   * Accepts administrative account invitation and sets up initial password.
   */
  async acceptInvitation(dto: AcceptInvitationDto) {
    const hashedToken = crypto.createHash('sha256').update(dto.token).digest('hex');

    const user = await this.prisma.user.findFirst({
      where: {
        invitationToken: hashedToken,
        invitationExpiresAt: { gt: new Date() },
      },
      include: {
        userRoles: true,
        userScopes: true,
      },
    });

    if (!user) {
      throw new BadRequestException('Invitation token is invalid or has expired.');
    }

    const rounds = parseInt(this.configService.get('BCRYPT_ROUNDS', '12'));
    const passwordHash = await bcrypt.hash(dto.password, rounds);

    const updatedUser = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        isActive: true,
        invitationToken: null,
        invitationExpiresAt: null,
        firstName: dto.firstName || user.firstName,
        lastName: dto.lastName || user.lastName,
      },
      include: {
        userRoles: true,
        userScopes: true,
      },
    });

    this.logger.log(`Invitation accepted by user ${updatedUser.email}`);
    return this.issueUserSession(updatedUser);
  }

  /**
   * Validates access token and verifies that the session is still active in Redis.
   */
  async validateToken(token: string): Promise<AuthTokenPayload> {
    try {
      const decoded = this.jwtService.verify(token);

      // Check if session exists in Redis
      const session = await this.redis.getJson(`session:${decoded.sessionId}`);
      if (!session) {
        throw new UnauthorizedException('Session expired or revoked');
      }

      return decoded;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  /**
   * Logs out a session by revoking it in both Redis and PostgreSQL.
   */
  async logout(sessionId: string): Promise<void> {
    await this.redis.del(`session:${sessionId}`);
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    this.logger.log(`Session ${sessionId} logged out`);
  }

  /**
   * Refresh token rotation: verifies refresh token, revokes previous session,
   * and issues a new access token and rotated refresh token.
   */
  async refreshToken(refreshToken: string) {
    try {
      const decoded = this.jwtService.verify(refreshToken);
      const hashedRefresh = crypto.createHash('sha256').update(refreshToken).digest('hex');

      // Verify DB session
      const dbSession = await this.prisma.session.findUnique({
        where: { id: decoded.sessionId },
      });

      if (!dbSession || dbSession.revokedAt || dbSession.expiresAt < new Date()) {
        throw new UnauthorizedException('Session has been revoked or expired');
      }

      if (dbSession.refreshToken !== hashedRefresh) {
        // Suspected token reuse/theft: revoke the entire session immediately
        await this.revokeAllUserSessions(decoded.userId);
        this.logger.error(`Possible refresh token reuse detected for session ${decoded.sessionId}. All sessions revoked.`);
        throw new UnauthorizedException('Invalid refresh token');
      }

      // Check user
      const user = await this.prisma.user.findUnique({
        where: { id: decoded.userId },
        include: {
          userRoles: true,
          userScopes: true,
        },
      });

      if (!user || !user.isActive || user.isSuspended) {
        throw new UnauthorizedException('User account is no longer active');
      }

      // Revoke old session and rotate
      await this.logout(decoded.sessionId);

      return this.issueUserSession(user);
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  /**
   * Revokes all active sessions for a user (called upon password change, suspension, deactivation).
   */
  async revokeAllUserSessions(userId: string): Promise<void> {
    const activeSessions = await this.prisma.session.findMany({
      where: { userId, revokedAt: null },
      select: { id: true },
    });

    for (const session of activeSessions) {
      await this.redis.del(`session:${session.id}`);
    }

    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    // Invalidate cached permissions
    await this.redis.del(`user:permissions:${userId}`);
    await this.redis.del(`user:${userId}:permissions`);

    this.logger.log(`Revoked all ${activeSessions.length} active sessions for user ID ${userId}`);
  }

  /**
   * Retrieves permissions for a user with 5-minute Redis caching.
   */
  async getUserPermissions(userId: string): Promise<string[]> {
    const cacheKey = `user:permissions:${userId}`;

    const cached = await this.redis.getJson<string[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { userRoles: true },
    });

    if (!user) {
      return [];
    }

    const permissions = new Set<string>();
    user.userRoles.forEach((ur: any) => {
      const rolePermissions = ROLE_PERMISSIONS[ur.role as UserRole] || [];
      rolePermissions.forEach((p: string) => permissions.add(p));
    });

    const permissionsArray = Array.from(permissions);
    await this.redis.setJson(cacheKey, permissionsArray, 300);

    return permissionsArray;
  }

  /**
   * Validates if a session is currently active and not revoked/expired in Redis or DB.
   */
  async validateActiveSession(sessionId: string, userId: string): Promise<boolean> {
    if (!sessionId) return false;
    const cached = await this.redis.getJson<any>(`session:${sessionId}`);
    if (cached) {
      return cached.userId === userId;
    }

    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: { user: true },
    });

    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      return false;
    }
    if (!session.user.isActive || session.user.isSuspended) {
      return false;
    }

    await this.redis.setJson(`session:${sessionId}`, { userId: session.userId }, 3600);
    return true;
  }

  private async createSession(userId: string, ipAddress?: string, userAgent?: string): Promise<string> {
    const sessionId = uuidv4();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await this.prisma.session.create({
      data: {
        id: sessionId,
        userId,
        token: sessionId,
        expiresAt,
        ipAddress: ipAddress || null,
        userAgent: userAgent || null,
      },
    });

    return sessionId;
  }

  async hashPassword(password: string): Promise<string> {
    const rounds = parseInt(this.configService.get('BCRYPT_ROUNDS', '12'));
    return bcrypt.hash(password, rounds);
  }
}
function uuidv4(): string {
  return crypto.randomUUID();
}
