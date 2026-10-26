import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { UsersService } from './users.service';
import { PrismaService } from '../../database/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { AuthService } from '../auth/auth.service';
import { UserRole } from '@heals/types';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: any;
  let redis: any;
  let authService: any;

  const mockUser = {
    id: 'user-001',
    email: 'test.user@healsonwheels.com',
    passwordHash: '$2b$10$hashed_password',
    firstName: 'Sarah',
    lastName: 'Connor',
    isActive: true,
    isSuspended: false,
    suspendedReason: null,
    mfaEnabled: false,
    mfaSecret: 'SECRET',
    mfaRecoveryCodes: ['CODE1'],
    invitationToken: 'token123',
    passwordResetToken: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-02'),
    userRoles: [{ role: UserRole.CLINICAL_REVIEWER, grantedAt: new Date(), grantedBy: 'admin-1' }],
    userScopes: [{ site: 'FL-ORLANDO', state: 'FL', legalEntity: 'HEALS_FL' }],
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      userRoleAssignment: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      userScope: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: jest.fn((cb) => cb(prisma)),
    };

    redis = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn().mockResolvedValue(1),
      getJson: jest.fn(),
      setJson: jest.fn(),
    };

    authService = {
      revokeAllUserSessions: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
        { provide: AuthService, useValue: authService },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  describe('findAll', () => {
    it('should return paginated and sanitized users', async () => {
      prisma.user.count.mockResolvedValue(1);
      prisma.user.findMany.mockResolvedValue([mockUser]);

      const result = await service.findAll({ page: 1, limit: 10, role: UserRole.CLINICAL_REVIEWER });

      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
      expect(result.data).toHaveLength(1);

      const user = result.data[0];
      expect(user.id).toBe(mockUser.id);
      expect(user.email).toBe(mockUser.email);
      expect(user.roles).toContain(UserRole.CLINICAL_REVIEWER);
      expect(user.scopes).toHaveLength(1);
      // Secrets must be stripped
      expect((user as any).passwordHash).toBeUndefined();
      expect((user as any).mfaSecret).toBeUndefined();
      expect((user as any).mfaRecoveryCodes).toBeUndefined();
      expect((user as any).invitationToken).toBeUndefined();
    });

    it('should correctly filter with search query, site, and state', async () => {
      prisma.user.count.mockResolvedValue(0);
      prisma.user.findMany.mockResolvedValue([]);

      await service.findAll({ search: 'Sarah', site: 'FL-ORLANDO', state: 'FL' });

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.any(Array),
            userScopes: expect.objectContaining({
              some: expect.objectContaining({ site: 'FL-ORLANDO', state: 'FL' }),
            }),
          }),
        }),
      );
    });
  });

  describe('findById', () => {
    it('should return a user profile if found', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);

      const user = await service.findById(mockUser.id);
      expect(user.id).toBe(mockUser.id);
      expect(user.email).toBe(mockUser.email);
      expect((user as any).passwordHash).toBeUndefined();
    });

    it('should throw NotFoundException if user is not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.findById('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('inviteUser', () => {
    it('should throw ConflictException if active user already exists', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...mockUser, isActive: true });

      await expect(
        service.inviteUser({
          email: mockUser.email,
          firstName: 'Sarah',
          lastName: 'Connor',
          roles: [UserRole.CLINICAL_REVIEWER],
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should create new invited user with token and 7-day expiration', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: 'new-user-1',
        email: 'new@heals.com',
        firstName: 'Alex',
        lastName: 'Vance',
      });

      const result = await service.inviteUser(
        {
          email: 'new@heals.com',
          firstName: 'Alex',
          lastName: 'Vance',
          roles: [UserRole.INTAKE_SPECIALIST],
          scopes: [{ site: 'SITE-1', state: 'FL' }],
        },
        'admin-001',
      );

      expect(result.id).toBe('new-user-1');
      expect(result.invitationToken).toBeDefined();
      expect(result.invitationToken).toHaveLength(64); // 32 bytes hex
      expect(result.invitationExpiresAt.getTime()).toBeGreaterThan(Date.now() + 6 * 24 * 60 * 60 * 1000);
      expect(prisma.userRoleAssignment.createMany).toHaveBeenCalledWith({
        data: [{ userId: 'new-user-1', role: UserRole.INTAKE_SPECIALIST, grantedBy: 'admin-001' }],
      });
      expect(prisma.userScope.createMany).toHaveBeenCalledWith({
        data: [{ userId: 'new-user-1', site: 'SITE-1', state: 'FL', legalEntity: null }],
      });
    });

    it('should refresh invitation if user already exists but is inactive', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        isActive: false,
      });

      const result = await service.inviteUser(
        {
          email: mockUser.email,
          firstName: 'Updated',
          lastName: 'Name',
          roles: [UserRole.SCHEDULER],
        },
        'admin-002',
      );

      expect(result.id).toBe(mockUser.id);
      expect(result.invitationToken).toBeDefined();
      expect(prisma.userRoleAssignment.deleteMany).toHaveBeenCalled();
      expect(prisma.userRoleAssignment.createMany).toHaveBeenCalled();
    });
  });

  describe('updateRoles', () => {
    it('should update roles and invalidate Redis permission caches', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce(mockUser)
        .mockResolvedValueOnce({
          ...mockUser,
          userRoles: [{ role: UserRole.ADMIN }],
        });

      const res = await service.updateRoles(
        mockUser.id,
        { roles: [UserRole.ADMIN] },
        'admin-001',
      );

      expect(prisma.userRoleAssignment.deleteMany).toHaveBeenCalledWith({ where: { userId: mockUser.id } });
      expect(prisma.userRoleAssignment.createMany).toHaveBeenCalledWith({
        data: [{ userId: mockUser.id, role: UserRole.ADMIN, grantedBy: 'admin-001' }],
      });
      expect(redis.del).toHaveBeenCalledWith(`user:permissions:${mockUser.id}`);
      expect(res.roles).toContain(UserRole.ADMIN);
    });

    it('should throw NotFoundException if user to update does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.updateRoles('unknown-id', { roles: [UserRole.ADMIN] }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateScopes', () => {
    it('should update user scopes', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce(mockUser)
        .mockResolvedValueOnce({
          ...mockUser,
          userScopes: [{ site: 'NEW-SITE', state: 'GA', legalEntity: 'HEALS_GA' }],
        });

      const res = await service.updateScopes(
        mockUser.id,
        { scopes: [{ site: 'NEW-SITE', state: 'GA', legalEntity: 'HEALS_GA' }] },
        'admin-001',
      );

      expect(prisma.userScope.deleteMany).toHaveBeenCalledWith({ where: { userId: mockUser.id } });
      expect(prisma.userScope.createMany).toHaveBeenCalledWith({
        data: [{ userId: mockUser.id, site: 'NEW-SITE', state: 'GA', legalEntity: 'HEALS_GA' }],
      });
      expect(res.scopes[0].site).toBe('NEW-SITE');
    });
  });

  describe('updateStatus', () => {
    it('should revoke all sessions when user is suspended', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.user.update.mockResolvedValue({
        ...mockUser,
        isSuspended: true,
        suspendedReason: 'Investigation',
      });

      const res = await service.updateStatus(
        mockUser.id,
        { isSuspended: true, suspendedReason: 'Investigation' },
        'admin-001',
      );

      expect(authService.revokeAllUserSessions).toHaveBeenCalledWith(mockUser.id);
      expect(redis.del).toHaveBeenCalledWith(`user:permissions:${mockUser.id}`);
      expect(res.isSuspended).toBe(true);
    });

    it('should revoke all sessions when user is deactivated', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.user.update.mockResolvedValue({
        ...mockUser,
        isActive: false,
      });

      const res = await service.updateStatus(mockUser.id, { isActive: false }, 'admin-001');

      expect(authService.revokeAllUserSessions).toHaveBeenCalledWith(mockUser.id);
      expect(res.isActive).toBe(false);
    });
  });

  describe('updateProfile', () => {
    it('should update first and last name', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.user.update.mockResolvedValue({
        ...mockUser,
        firstName: 'Jane',
        lastName: 'Doe',
      });

      const res = await service.updateProfile(mockUser.id, { firstName: 'Jane', lastName: 'Doe' });
      expect(res.firstName).toBe('Jane');
      expect(res.lastName).toBe('Doe');
    });
  });

  describe('deactivateUser', () => {
    it('should deactivate user and revoke sessions', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.user.update.mockResolvedValue({
        ...mockUser,
        isActive: false,
      });

      await service.deactivateUser(mockUser.id, 'admin-001');

      expect(authService.revokeAllUserSessions).toHaveBeenCalledWith(mockUser.id);
    });
  });
});
