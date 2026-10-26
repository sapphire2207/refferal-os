import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { DistributedRateLimiterService } from '../../common/services/rate-limiter.service';
import { UserRole, AuthTokenPayload } from '@heals/types';

describe('UsersController', () => {
  let controller: UsersController;
  let usersService: any;
  let rateLimiter: any;

  const mockAdminUser: AuthTokenPayload = {
    userId: 'admin-1',
    email: 'admin@heals.com',
    roles: [UserRole.ADMIN],
    scopes: { sites: [], states: [], legalEntities: [] },
    sessionId: 'sess-admin',
    iat: 1234567,
    exp: 9999999,
  };

  const mockNormalUser: AuthTokenPayload = {
    userId: 'user-2',
    email: 'user2@heals.com',
    roles: [UserRole.INTAKE_SPECIALIST],
    scopes: { sites: [], states: [], legalEntities: [] },
    sessionId: 'sess-normal',
    iat: 1234567,
    exp: 9999999,
  };

  beforeEach(async () => {
    usersService = {
      findAll: jest.fn().mockResolvedValue({ data: [], total: 0 }),
      findById: jest.fn().mockResolvedValue({ id: 'user-2', email: 'user2@heals.com' }),
      inviteUser: jest.fn().mockResolvedValue({ id: 'user-3', invitationToken: 'token' }),
      updateRoles: jest.fn().mockResolvedValue({ id: 'user-2' }),
      updateScopes: jest.fn().mockResolvedValue({ id: 'user-2' }),
      updateStatus: jest.fn().mockResolvedValue({ id: 'user-2' }),
      updateProfile: jest.fn().mockResolvedValue({ id: 'user-2' }),
      deactivateUser: jest.fn().mockResolvedValue({ id: 'user-2' }),
    };

    rateLimiter = {
      enforce: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: usersService },
        { provide: DistributedRateLimiterService, useValue: rateLimiter },
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
  });

  describe('findAll', () => {
    it('should delegate to usersService.findAll', async () => {
      await controller.findAll({ page: 1, limit: 10 });
      expect(usersService.findAll).toHaveBeenCalledWith({ page: 1, limit: 10 });
    });
  });

  describe('getProfile', () => {
    it('should return current user profile', async () => {
      const res = await controller.getProfile(mockNormalUser);
      expect(usersService.findById).toHaveBeenCalledWith('user-2');
      expect(res.id).toBe('user-2');
    });
  });

  describe('inviteUser', () => {
    it('should rate limit and delegate to usersService.inviteUser', async () => {
      const dto = {
        email: 'invitee@heals.com',
        firstName: 'Bob',
        lastName: 'Ross',
        roles: [UserRole.CLINICAL_REVIEWER],
      };
      const req = { ip: '127.0.0.1' } as any;

      await controller.inviteUser(dto, mockAdminUser, req);

      expect(rateLimiter.enforce).toHaveBeenCalled();
      expect(usersService.inviteUser).toHaveBeenCalledWith(dto, mockAdminUser.userId);
    });
  });

  describe('updateProfile', () => {
    it('should allow user to update their own profile', async () => {
      await controller.updateProfile('user-2', { firstName: 'Updated' }, mockNormalUser);
      expect(usersService.updateProfile).toHaveBeenCalledWith('user-2', { firstName: 'Updated' });
    });

    it('should allow admin to update another user profile', async () => {
      await controller.updateProfile('user-2', { firstName: 'UpdatedByAdmin' }, mockAdminUser);
      expect(usersService.updateProfile).toHaveBeenCalledWith('user-2', { firstName: 'UpdatedByAdmin' });
    });

    it('should reject when non-admin tries to update another user profile', async () => {
      await expect(
        controller.updateProfile('other-user-999', { firstName: 'Hacked' }, mockNormalUser),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('deactivateUser', () => {
    it('should delegate deactivation to usersService', async () => {
      await controller.deactivateUser('user-2', mockAdminUser);
      expect(usersService.deactivateUser).toHaveBeenCalledWith('user-2', mockAdminUser.userId);
    });
  });
});
