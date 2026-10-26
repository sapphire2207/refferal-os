import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../database/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { AuthTokenPayload } from '@heals/types';
import { ROLE_PERMISSIONS } from '@heals/constants';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redis: RedisService,
  ) {}

  async validateUser(email: string, password: string): Promise<any> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        userRoles: true,
        userScopes: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is inactive');
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return user;
  }

  async login(user: any) {
    const sessionId = await this.createSession(user.id);

    const roles = user.userRoles.map((ur: any) => ur.role);
    const scopes = {
      sites: [...new Set(user.userScopes.map((us: any) => us.site).filter(Boolean))],
      states: [...new Set(user.userScopes.map((us: any) => us.state).filter(Boolean))],
      legalEntities: [
        ...new Set(user.userScopes.map((us: any) => us.legalEntity).filter(Boolean)),
      ],
    };

    const payload: Omit<AuthTokenPayload, 'iat' | 'exp'> = {
      userId: user.id,
      email: user.email,
      roles,
      scopes,
      sessionId,
    };

    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(
      { userId: user.id, sessionId },
      {
        expiresIn: this.configService.get('REFRESH_TOKEN_EXPIRATION', '7d'),
      },
    );

    // Store session in Redis
    await this.redis.setJson(`session:${sessionId}`, payload, 60 * 60 * 24); // 24 hours

    // Update last login
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    this.logger.log(`User ${user.email} logged in successfully`);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        roles,
      },
    };
  }

  async validateToken(token: string): Promise<AuthTokenPayload> {
    try {
      const decoded = this.jwtService.verify(token);
      
      // Check if session exists in Redis
      const session = await this.redis.getJson(`session:${decoded.sessionId}`);
      if (!session) {
        throw new UnauthorizedException('Session expired');
      }

      return decoded;
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  async logout(sessionId: string): Promise<void> {
    await this.redis.del(`session:${sessionId}`);
    this.logger.log(`Session ${sessionId} logged out`);
  }

  async refreshToken(refreshToken: string) {
    try {
      const decoded = this.jwtService.verify(refreshToken);
      
      const user = await this.prisma.user.findUnique({
        where: { id: decoded.userId },
        include: {
          userRoles: true,
          userScopes: true,
        },
      });

      if (!user || !user.isActive) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      return this.login(user);
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async getUserPermissions(userId: string): Promise<string[]> {
    const cacheKey = `user:${userId}:permissions`;
    
    // Check cache
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
      const rolePermissions = ROLE_PERMISSIONS[ur.role] || [];
      rolePermissions.forEach((p) => permissions.add(p));
    });

    const permissionsArray = Array.from(permissions);

    // Cache for 5 minutes
    await this.redis.setJson(cacheKey, permissionsArray, 300);

    return permissionsArray;
  }

  private async createSession(userId: string): Promise<string> {
    const sessionId = `${userId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    await this.prisma.session.create({
      data: {
        id: sessionId,
        userId,
        token: sessionId,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      },
    });

    return sessionId;
  }

  async hashPassword(password: string): Promise<string> {
    const rounds = parseInt(this.configService.get('BCRYPT_ROUNDS', '12'));
    return bcrypt.hash(password, rounds);
  }
}
