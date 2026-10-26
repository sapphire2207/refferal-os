import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger, UseGuards } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth/auth.service';
import { AuthTokenPayload } from '@heals/types';

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  namespace: '/events',
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(EventsGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
  ) {}

  /**
   * Enforces JWT handshake authentication and room scoping.
   */
  async handleConnection(client: Socket) {
    try {
      const authHeader =
        client.handshake.auth?.token ||
        (client.handshake.headers?.authorization as string);

      if (!authHeader) {
        this.logger.warn(`Rejected unauthenticated WebSocket connection from ${client.id}`);
        client.disconnect(true);
        return;
      }

      const token = authHeader.replace(/^Bearer\s+/i, '').trim();
      const secret = this.configService.get('JWT_SECRET');
      const payload: AuthTokenPayload = this.jwtService.verify(token, { secret });

      if (payload.sessionId) {
        const isActive = await this.authService.validateActiveSession(
          payload.sessionId,
          payload.userId,
        );
        if (!isActive) {
          this.logger.warn(
            `Rejected WebSocket client ${client.id} due to revoked/expired session ${payload.sessionId}`,
          );
          client.disconnect(true);
          return;
        }
      }

      // Attach user payload to socket session
      client.data.user = payload;

      // Join individual user notifications room
      await client.join(`user:${payload.userId}`);

      // Join regional and site scope broadcast rooms
      if (payload.scopes?.states) {
        for (const state of payload.scopes.states) {
          await client.join(`scope:state:${state}`);
        }
      }
      if (payload.scopes?.sites) {
        for (const site of payload.scopes.sites) {
          await client.join(`scope:site:${site}`);
        }
      }

      this.logger.log(
        `WebSocket client connected: ${client.id} (user: ${payload.email}, rooms: user:${payload.userId})`,
      );
    } catch (err: any) {
      this.logger.warn(`WebSocket handshake failed for client ${client.id}: ${err.message}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`WebSocket client disconnected: ${client.id}`);
  }

  /**
   * Real-time subscription to referral-specific live updates.
   */
  @SubscribeMessage('subscribe_referral')
  async handleSubscribeReferral(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { referralId: string },
  ) {
    const user = client.data.user as AuthTokenPayload;
    if (!user || !data?.referralId) return { error: 'Unauthorized or missing referralId' };

    await client.join(`referral:${data.referralId}`);
    return { success: true, room: `referral:${data.referralId}` };
  }

  @SubscribeMessage('unsubscribe_referral')
  async handleUnsubscribeReferral(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { referralId: string },
  ) {
    if (!data?.referralId) return { error: 'Missing referralId' };
    await client.leave(`referral:${data.referralId}`);
    return { success: true };
  }

  /**
   * Broadcast message to a specific authenticated user.
   */
  sendToUser(userId: string, event: string, payload: any) {
    if (!this.server) return;
    this.server.to(`user:${userId}`).emit(event, payload);
  }

  /**
   * Broadcast message to a geographic state or site scope room.
   */
  broadcastToScope(scopeType: 'state' | 'site', identifier: string, event: string, payload: any) {
    if (!this.server) return;
    this.server.to(`scope:${scopeType}:${identifier}`).emit(event, payload);
  }

  /**
   * Broadcast live stage transition or update to referral subscribers.
   */
  broadcastReferralUpdate(referralId: string, event: string, payload: any) {
    if (!this.server) return;
    this.server.to(`referral:${referralId}`).emit(event, payload);
  }
}
