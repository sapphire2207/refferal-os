import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';
import { AuthTokenPayload } from '@heals/types';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get('JWT_SECRET'),
    });
  }

  async validate(payload: AuthTokenPayload): Promise<AuthTokenPayload> {
    if (payload.sessionId) {
      const isValid = await this.authService.validateActiveSession(payload.sessionId, payload.userId);
      if (!isValid) {
        throw new UnauthorizedException('Session has been revoked or expired');
      }
    }

    // Get live user permissions and scopes
    const [permissions, liveScopes] = await Promise.all([
      this.authService.getUserPermissions(payload.userId),
      this.authService.getUserScopes(payload.userId),
    ]);
    
    return {
      ...payload,
      scopes: liveScopes || payload.scopes,
      permissions,
    } as unknown as AuthTokenPayload;
  }
}
