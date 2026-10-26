import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, BadRequestException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { authenticator } from 'otplib';
import { AuthService } from './auth.service';
import { PrismaService } from '../../database/prisma.service';
import { RedisService } from '../../redis/redis.service';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: any;
  let redis: any;
  let jwt: any;

  const mockUser = {
    id: 'user-123',
    email: 'test@healsonwheels.com',
    passwordHash: '',
    firstName: 'Jane',
    lastName: 'Doe',
    isActive: true,
    isSuspended: false,
    mfaEnabled: false,
    mfaSecret: null,
    mfaRecoveryCodes: [],
    userRoles: [{ role: 'INTAKE_SPECIALIST' }],
    userScopes: [{ site: 'Site-A', state: 'FL', legalEntity: 'HEALS_FL' }],
  };

  beforeAll(async () => {
    mockUser.passwordHash = await bcrypt.hash('CorrectPassword123!', 10);
  });

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      session: {
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    redis = {
      setJson: jest.fn().mockResolvedValue('OK'),
      getJson: jest.fn(),
      del: jest.fn().mockResolvedValue(1),
    };

    jwt = {
      sign: jest.fn().mockReturnValue('mock.jwt.token'),
      verify: jest.fn(),
    };

    const config = {
      get: jest.fn((key: string, def?: string) => {
        if (key === 'BCRYPT_ROUNDS') return '10';
        if (key === 'JWT_EXPIRATION') return '15m';
        if (key === 'REFRESH_TOKEN_EXPIRATION') return '7d';
        return def;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
        { provide: JwtService, useValue: jwt },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('validateUser', () => {
    it('should validate active user with correct password', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.validateUser('test@healsonwheels.com', 'CorrectPassword123!');
      expect(result).toBeDefined();
      expect(result.id).toBe(mockUser.id);
    });

    it('should reject non-existent email', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.validateUser('unknown@healsonwheels.com', 'password'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should reject incorrect password', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);

      await expect(
        service.validateUser('test@healsonwheels.com', 'WrongPassword!'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should reject inactive user', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...mockUser, isActive: false });

      await expect(
        service.validateUser('test@healsonwheels.com', 'CorrectPassword123!'),
      ).rejects.toThrow('Account is inactive');
    });

    it('should reject suspended user with suspension reason', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        isSuspended: true,
        suspendedReason: 'Investigation pending',
      });

      await expect(
        service.validateUser('test@healsonwheels.com', 'CorrectPassword123!'),
      ).rejects.toThrow('Investigation pending');
    });
  });

  describe('login & MFA challenge', () => {
    it('should issue tokens directly when MFA is disabled', async () => {
      prisma.user.update.mockResolvedValue(mockUser);
      prisma.session.create.mockResolvedValue({});
      prisma.session.update.mockResolvedValue({});

      const response: any = await service.login(mockUser);
      expect(response.mfaRequired).toBe(false);
      expect(response.accessToken).toBe('mock.jwt.token');
      expect(response.refreshToken).toBe('mock.jwt.token');
      expect(redis.setJson).toHaveBeenCalled();
    });

    it('should issue an MFA challenge ticket when MFA is enabled', async () => {
      const mfaUser = { ...mockUser, mfaEnabled: true, mfaSecret: 'JBSWY3DPEHPK3PXP' };
      const response: any = await service.login(mfaUser);

      expect(response.mfaRequired).toBe(true);
      expect(response.mfaToken).toBeDefined();
      expect(response.accessToken).toBeUndefined();
      expect(redis.setJson).toHaveBeenCalledWith(
        expect.stringContaining('mfa:ticket:'),
        { userId: mfaUser.id },
        300,
      );
    });
  });

  describe('MFA Setup, Enable & Verify', () => {
    it('should setup MFA and return TOTP secret and QR code URL', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);

      const setup = await service.setupMfa(mockUser.id);
      expect(setup.secret).toBeDefined();
      expect(setup.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
      expect(setup.otpauthUri).toContain('Heals%20on%20Wheels');
      expect(redis.setJson).toHaveBeenCalledWith(
        `mfa:setup:${mockUser.id}`,
        { secret: setup.secret },
        900,
      );
    });

    it('should enable MFA with valid TOTP code and return 8 recovery codes', async () => {
      const secret = authenticator.generateSecret();
      redis.getJson.mockResolvedValue({ secret });
      const validCode = authenticator.generate(secret);

      prisma.user.update.mockResolvedValue({});

      const result = await service.enableMfa(mockUser.id, validCode);
      expect(result.enabled).toBe(true);
      expect(result.recoveryCodes).toHaveLength(8);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockUser.id },
          data: expect.objectContaining({
            mfaEnabled: true,
            mfaSecret: secret,
            mfaRecoveryCodes: expect.any(Array),
          }),
        }),
      );
    });

    it('should verify MFA ticket with valid TOTP code and issue tokens', async () => {
      const secret = authenticator.generateSecret();
      const code = authenticator.generate(secret);
      redis.getJson.mockResolvedValue({ userId: mockUser.id });

      const mfaUser = {
        ...mockUser,
        mfaEnabled: true,
        mfaSecret: secret,
        mfaRecoveryCodes: [],
      };
      prisma.user.findUnique.mockResolvedValue(mfaUser);
      prisma.user.update.mockResolvedValue(mfaUser);
      prisma.session.create.mockResolvedValue({});
      prisma.session.update.mockResolvedValue({});

      const response = await service.verifyMfa('ticket-123', code);
      expect(response.accessToken).toBe('mock.jwt.token');
      expect(redis.del).toHaveBeenCalledWith('mfa:ticket:ticket-123');
    });

    it('should verify MFA ticket with recovery code and burn the code', async () => {
      const plainRecoveryCode = 'ABCDE12345';
      const hashedCode = crypto.createHash('sha256').update(plainRecoveryCode).digest('hex');

      redis.getJson.mockResolvedValue({ userId: mockUser.id });

      const mfaUser = {
        ...mockUser,
        mfaEnabled: true,
        mfaSecret: 'SECRET',
        mfaRecoveryCodes: [hashedCode],
      };
      prisma.user.findUnique.mockResolvedValue(mfaUser);
      prisma.user.update.mockResolvedValue(mfaUser);
      prisma.session.create.mockResolvedValue({});
      prisma.session.update.mockResolvedValue({});

      const response = await service.verifyMfa('ticket-123', plainRecoveryCode);
      expect(response.accessToken).toBe('mock.jwt.token');
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            mfaRecoveryCodes: [], // Burned recovery code
          }),
        }),
      );
    });
  });

  describe('Password Reset', () => {
    it('should return safe generic response even if email is unknown', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const res = await service.requestPasswordReset({ email: 'nonexistent@heals.com' });
      expect(res.message).toContain('If an account exists');
    });

    it('should save hashed reset token when user exists', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.user.update.mockResolvedValue(mockUser);

      const res = await service.requestPasswordReset({ email: mockUser.email });
      expect(res.message).toContain('If an account exists');
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            passwordResetToken: expect.any(String),
            passwordResetExpiresAt: expect.any(Date),
          }),
        }),
      );
    });

    it('should confirm password reset and revoke all existing sessions', async () => {
      prisma.user.findFirst.mockResolvedValue(mockUser);
      prisma.user.update.mockResolvedValue(mockUser);
      prisma.session.findMany.mockResolvedValue([{ id: 'sess-1' }, { id: 'sess-2' }]);
      prisma.session.updateMany.mockResolvedValue({ count: 2 });

      const res = await service.confirmPasswordReset({
        token: 'valid-reset-token',
        newPassword: 'BrandNewPassword123!',
      });

      expect(res.success).toBe(true);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            passwordResetToken: null,
            passwordResetExpiresAt: null,
          }),
        }),
      );
      // Revoked in Redis and DB
      expect(redis.del).toHaveBeenCalledWith('session:sess-1');
      expect(redis.del).toHaveBeenCalledWith('session:sess-2');
      expect(prisma.session.updateMany).toHaveBeenCalled();
    });
  });

  describe('Account Invitations', () => {
    it('should accept invitation and initialize user account', async () => {
      const invitedUser = {
        ...mockUser,
        isActive: false,
        invitationToken: 'hashed-invitation-token',
        invitationExpiresAt: new Date(Date.now() + 3600000),
      };

      prisma.user.findFirst.mockResolvedValue(invitedUser);
      prisma.user.update.mockResolvedValue({ ...invitedUser, isActive: true });
      prisma.session.create.mockResolvedValue({});
      prisma.session.update.mockResolvedValue({});

      const result = await service.acceptInvitation({
        token: 'plain-invitation-token',
        password: 'InitialPassword123!',
        firstName: 'Jane',
        lastName: 'Doe',
      });

      expect(result.accessToken).toBe('mock.jwt.token');
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isActive: true,
            invitationToken: null,
          }),
        }),
      );
    });
  });

  describe('Refresh Token Rotation & Revocation', () => {
    it('should rotate refresh token and issue new session', async () => {
      const plainRefresh = 'refresh-token-123';
      const hashedRefresh = crypto.createHash('sha256').update(plainRefresh).digest('hex');

      jwt.verify.mockReturnValue({ userId: mockUser.id, sessionId: 'sess-old' });

      prisma.session.findUnique.mockResolvedValue({
        id: 'sess-old',
        userId: mockUser.id,
        refreshToken: hashedRefresh,
        expiresAt: new Date(Date.now() + 86400000),
        revokedAt: null,
      });

      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.user.update.mockResolvedValue(mockUser);
      prisma.session.create.mockResolvedValue({});
      prisma.session.update.mockResolvedValue({});
      prisma.session.updateMany.mockResolvedValue({});

      const response = await service.refreshToken(plainRefresh);
      expect(response.accessToken).toBe('mock.jwt.token');
      // Revoked old session
      expect(redis.del).toHaveBeenCalledWith('session:sess-old');
    });

    it('should detect token theft and revoke all sessions if refresh token mismatch', async () => {
      jwt.verify.mockReturnValue({ userId: mockUser.id, sessionId: 'sess-stolen' });

      prisma.session.findUnique.mockResolvedValue({
        id: 'sess-stolen',
        userId: mockUser.id,
        refreshToken: 'different-hash',
        expiresAt: new Date(Date.now() + 86400000),
        revokedAt: null,
      });

      prisma.session.findMany.mockResolvedValue([{ id: 'sess-stolen' }]);
      prisma.session.updateMany.mockResolvedValue({ count: 1 });

      await expect(service.refreshToken('replayed-token')).rejects.toThrow(
        UnauthorizedException,
      );
      // Revoked all sessions
      expect(redis.del).toHaveBeenCalledWith('session:sess-stolen');
    });
  });
});
