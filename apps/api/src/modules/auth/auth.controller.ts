import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Request,
  Req,
  Ip,
  Headers,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiHeader,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import {
  MfaEnableDto,
  MfaDisableDto,
  MfaVerifyDto,
  PasswordResetRequestDto,
  PasswordResetConfirmDto,
  AcceptInvitationDto,
  RefreshTokenDto,
} from './dto/auth.dto';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthGuard } from '@nestjs/passport';
import { DistributedRateLimiterService } from '../../common/services/rate-limiter.service';
import { AuthTokenPayload } from '@heals/types';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly rateLimiter: DistributedRateLimiterService,
  ) {}

  /**
   * POST /api/v1/auth/login
   * Validates credentials and returns tokens or triggers MFA challenge.
   */
  @Public()
  @UseGuards(AuthGuard('local'))
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiResponse({ status: 200, description: 'Authentication successful or MFA ticket issued' })
  @ApiResponse({ status: 401, description: 'Invalid credentials or account inactive/suspended' })
  @ApiResponse({ status: 429, description: 'Too many login attempts. Blocked for 15 minutes.' })
  async login(
    @Request() req: any,
    @Body() loginDto: LoginDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    const rateLimitKey = `${ip}:${loginDto.email.toLowerCase()}`;
    await this.rateLimiter.enforce('auth-login', rateLimitKey);

    const result = await this.authService.login(req.user, ip, userAgent);

    // On successful credential validation, reset failed attempts
    await this.rateLimiter.reset('auth-login', rateLimitKey);
    return result;
  }

  /**
   * POST /api/v1/auth/mfa/verify
   * Completes login challenge using 6-digit TOTP code or backup recovery code.
   */
  @Public()
  @Post('mfa/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify MFA challenge to complete login' })
  @ApiResponse({ status: 200, description: 'MFA verified, session established' })
  @ApiResponse({ status: 401, description: 'Invalid or expired MFA code or ticket' })
  @ApiResponse({ status: 429, description: 'Too many verification attempts' })
  async verifyMfa(
    @Body() dto: MfaVerifyDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    await this.rateLimiter.enforce('auth-mfa', ip);
    const result = await this.authService.verifyMfa(dto.mfaToken, dto.code, ip, userAgent);
    await this.rateLimiter.reset('auth-mfa', ip);
    return result;
  }

  /**
   * POST /api/v1/auth/mfa/setup
   * Generates a new TOTP secret and QR code for an authenticated user.
   */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('mfa/setup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Initialize MFA setup (returns TOTP secret & QR code)' })
  @ApiResponse({ status: 200, description: 'MFA setup initialized' })
  async setupMfa(@CurrentUser() user: AuthTokenPayload) {
    return this.authService.setupMfa(user.userId);
  }

  /**
   * POST /api/v1/auth/mfa/enable
   * Verifies initial TOTP code and activates MFA on the user account.
   */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('mfa/enable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Enable MFA with authenticator verification code' })
  @ApiResponse({ status: 200, description: 'MFA activated; returns backup recovery codes' })
  async enableMfa(
    @CurrentUser() user: AuthTokenPayload,
    @Body() dto: MfaEnableDto,
  ) {
    return this.authService.enableMfa(user.userId, dto.code);
  }

  /**
   * POST /api/v1/auth/mfa/disable
   * Deactivates MFA with password and TOTP/recovery verification.
   */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('mfa/disable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Disable MFA on user account' })
  @ApiResponse({ status: 200, description: 'MFA disabled' })
  async disableMfa(
    @CurrentUser() user: AuthTokenPayload,
    @Body() dto: MfaDisableDto,
  ) {
    return this.authService.disableMfa(user.userId, dto.password, dto.code);
  }

  /**
   * POST /api/v1/auth/refresh
   * Rotates JWT access and refresh tokens.
   */
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate refresh token and retrieve new access token' })
  @ApiResponse({ status: 200, description: 'Tokens rotated successfully' })
  @ApiResponse({ status: 401, description: 'Invalid or revoked refresh token' })
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Ip() ip: string,
  ) {
    await this.rateLimiter.enforce('auth-refresh', ip);
    return this.authService.refreshToken(dto.refreshToken);
  }

  /**
   * POST /api/v1/auth/logout
   * Revokes the active session in Redis and PostgreSQL.
   */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke current session and logout' })
  @ApiResponse({ status: 204, description: 'Session terminated' })
  async logout(@CurrentUser('sessionId') sessionId: string) {
    await this.authService.logout(sessionId);
  }

  /**
   * POST /api/v1/auth/password-reset/request
   * Requests password reset instructions. Never leaks email existence.
   */
  @Public()
  @Post('password-reset/request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request password reset instructions via email' })
  @ApiResponse({ status: 200, description: 'Generic safe response acknowledging request' })
  async requestPasswordReset(
    @Body() dto: PasswordResetRequestDto,
    @Ip() ip: string,
  ) {
    await this.rateLimiter.enforce('auth-reset', ip);
    return this.authService.requestPasswordReset(dto);
  }

  /**
   * POST /api/v1/auth/password-reset/confirm
   * Confirms password reset with token and revokes all active sessions.
   */
  @Public()
  @Post('password-reset/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm password reset with secure token' })
  @ApiResponse({ status: 200, description: 'Password reset confirmed, all sessions revoked' })
  @ApiResponse({ status: 400, description: 'Invalid or expired token' })
  async confirmPasswordReset(
    @Body() dto: PasswordResetConfirmDto,
    @Ip() ip: string,
  ) {
    await this.rateLimiter.enforce('auth-reset', ip);
    return this.authService.confirmPasswordReset(dto);
  }

  /**
   * POST /api/v1/auth/invitations/accept
   * Accepts administrative account invitation and establishes initial password.
   */
  @Public()
  @Post('invitations/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept account invitation and set initial password' })
  @ApiResponse({ status: 200, description: 'Invitation accepted and initial session created' })
  @ApiResponse({ status: 400, description: 'Invalid or expired invitation token' })
  async acceptInvitation(
    @Body() dto: AcceptInvitationDto,
    @Ip() ip: string,
  ) {
    await this.rateLimiter.enforce('auth-login', ip);
    return this.authService.acceptInvitation(dto);
  }

  /**
   * GET /api/v1/auth/me
   * Returns current authenticated user information and scopes.
   */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get current authenticated user profile and scopes' })
  @ApiResponse({ status: 200, description: 'User profile' })
  async me(@CurrentUser() user: AuthTokenPayload) {
    return { user };
  }
}
