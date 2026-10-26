import { Test, TestingModule } from '@nestjs/testing';
import { EventsGateway } from './events.gateway';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth/auth.service';
import { UserRole } from '@heals/types';

describe('EventsGateway', () => {
  let gateway: EventsGateway;
  let jwtService: any;
  let configService: any;
  let authService: any;

  beforeEach(async () => {
    jwtService = {
      verify: jest.fn(),
    };

    configService = {
      get: jest.fn().mockReturnValue('mock-jwt-secret'),
    };

    authService = {
      validateActiveSession: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsGateway,
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
        { provide: AuthService, useValue: authService },
      ],
    }).compile();

    gateway = module.get<EventsGateway>(EventsGateway);
    gateway.server = {
      to: jest.fn().mockReturnValue({ emit: jest.fn() }),
    } as any;
  });

  describe('handleConnection', () => {
    it('should disconnect client if no auth token provided', async () => {
      const mockClient: any = {
        id: 'client-1',
        handshake: { auth: {}, headers: {} },
        disconnect: jest.fn(),
      };

      await gateway.handleConnection(mockClient);
      expect(mockClient.disconnect).toHaveBeenCalledWith(true);
    });

    it('should disconnect client if session is revoked/invalid', async () => {
      jwtService.verify.mockReturnValue({
        userId: 'user-1',
        sessionId: 'sess-revoked',
        roles: [UserRole.INTAKE_SPECIALIST],
      });
      authService.validateActiveSession.mockResolvedValue(false); // Session revoked!

      const mockClient: any = {
        id: 'client-2',
        handshake: { auth: { token: 'Bearer valid.jwt.token' } },
        disconnect: jest.fn(),
      };

      await gateway.handleConnection(mockClient);
      expect(mockClient.disconnect).toHaveBeenCalledWith(true);
    });

    it('should authenticate client, set client.data.user, and join user and scope rooms', async () => {
      const payload = {
        userId: 'user-1',
        email: 'staff@heals.com',
        sessionId: 'sess-valid',
        roles: [UserRole.INTAKE_SPECIALIST],
        scopes: { sites: ['FL-MIAMI'], states: ['FL'] },
      };
      jwtService.verify.mockReturnValue(payload);
      authService.validateActiveSession.mockResolvedValue(true);

      const mockClient: any = {
        id: 'client-3',
        handshake: { auth: { token: 'valid.token' } },
        data: {},
        join: jest.fn().mockResolvedValue(undefined),
        disconnect: jest.fn(),
      };

      await gateway.handleConnection(mockClient);

      expect(mockClient.data.user).toBe(payload);
      expect(mockClient.join).toHaveBeenCalledWith('user:user-1');
      expect(mockClient.join).toHaveBeenCalledWith('scope:state:FL');
      expect(mockClient.join).toHaveBeenCalledWith('scope:site:FL-MIAMI');
      expect(mockClient.disconnect).not.toHaveBeenCalled();
    });
  });

  describe('broadcasting methods', () => {
    it('should send event to specific user room', () => {
      gateway.sendToUser('user-1', 'notification', { title: 'Hello' });
      expect(gateway.server.to).toHaveBeenCalledWith('user:user-1');
    });

    it('should broadcast to scope room', () => {
      gateway.broadcastToScope('state', 'FL', 'referral_created', { id: 'ref-1' });
      expect(gateway.server.to).toHaveBeenCalledWith('scope:state:FL');
    });

    it('should broadcast to referral room', () => {
      gateway.broadcastReferralUpdate('ref-1', 'stage_advanced', { stage: 'SCHEDULING' });
      expect(gateway.server.to).toHaveBeenCalledWith('referral:ref-1');
    });
  });
});
