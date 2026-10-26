import { IsEmail, IsString, MinLength, IsOptional, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class MfaSetupResponseDto {
  @ApiProperty({ description: 'Base32 TOTP Secret' })
  secret: string;

  @ApiProperty({ description: 'Data URL for QR Code scan' })
  qrCodeDataUrl: string;

  @ApiProperty({ description: 'otpauth URI for manual authenticator entry' })
  otpauthUri: string;
}

export class MfaEnableDto {
  @ApiProperty({ description: '6-digit TOTP verification code from authenticator app', example: '123456' })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'MFA code must be exactly 6 digits' })
  code: string;
}

export class MfaEnableResponseDto {
  @ApiProperty({ description: 'Success confirmation' })
  enabled: boolean;

  @ApiProperty({ description: 'One-time backup recovery codes', type: [String] })
  recoveryCodes: string[];
}

export class MfaDisableDto {
  @ApiProperty({ description: 'Current password for verification' })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ description: '6-digit TOTP code or backup recovery code' })
  @IsString()
  code: string;
}

export class MfaVerifyDto {
  @ApiProperty({ description: 'Temporary MFA verification ticket from initial login stage' })
  @IsString()
  mfaToken: string;

  @ApiProperty({ description: '6-digit TOTP code or 10-character recovery code', example: '123456' })
  @IsString()
  code: string;
}

export class PasswordResetRequestDto {
  @ApiProperty({ description: 'Account email address', example: 'doctor@healsonwheels.com' })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email: string;
}

export class PasswordResetConfirmDto {
  @ApiProperty({ description: 'Password reset token received via secure email' })
  @IsString()
  token: string;

  @ApiProperty({ description: 'New password (min 8 chars, 1 uppercase, 1 lowercase, 1 number)', example: 'SecurePass123!' })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @Matches(/((?=.*\d)|(?=.*\W+))(?![.\n])(?=.*[A-Z])(?=.*[a-z]).*$/, {
    message: 'Password must contain uppercase, lowercase, and numbers or symbols',
  })
  newPassword: string;
}

export class AcceptInvitationDto {
  @ApiProperty({ description: 'Cryptographic invitation token' })
  @IsString()
  token: string;

  @ApiProperty({ description: 'Initial account password', example: 'SecurePass123!' })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @Matches(/((?=.*\d)|(?=.*\W+))(?![.\n])(?=.*[A-Z])(?=.*[a-z]).*$/, {
    message: 'Password must contain uppercase, lowercase, and numbers or symbols',
  })
  password: string;

  @ApiPropertyOptional({ description: 'Optional confirmed first name' })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional({ description: 'Optional confirmed last name' })
  @IsOptional()
  @IsString()
  lastName?: string;
}

export class RefreshTokenDto {
  @ApiProperty({ description: 'JWT refresh token' })
  @IsString()
  refreshToken: string;
}
