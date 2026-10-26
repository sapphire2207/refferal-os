import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsUUID,
  IsNumber,
  Min,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BillingStatus } from '@heals/types';

export class CreateClaimDto {
  @ApiProperty({ example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' })
  @IsUUID('4', { message: 'referralId must be a valid UUID' })
  @IsNotEmpty()
  referralId: string;

  @ApiPropertyOptional({ example: 'CLM-2026-994821' })
  @IsOptional()
  @IsString()
  claimNumber?: string;
}

export class SubmitClaimDto {
  @ApiPropertyOptional({ example: 'EDI-837P-994821038' })
  @IsOptional()
  @IsString()
  externalReference?: string;

  @ApiPropertyOptional({ description: 'Force re-submission if prior submission failed' })
  @IsOptional()
  @IsBoolean()
  forceResubmit?: boolean;
}

export class AdjudicateClaimDto {
  @ApiProperty({
    enum: [BillingStatus.PAID, BillingStatus.DENIED, BillingStatus.REJECTED],
    example: BillingStatus.PAID,
  })
  @IsEnum(BillingStatus)
  @IsNotEmpty()
  status: BillingStatus;

  @ApiPropertyOptional({ example: 285.50 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  paidAmount?: number;

  @ApiPropertyOptional({ example: 'CO-45: Charges exceed fee schedule/maximum allowable or contracted/legislated fee arrangement.' })
  @IsOptional()
  @IsString()
  denialReason?: string;

  @ApiPropertyOptional({ example: 'Missing NPI or invalid taxonomy code in Loop 2310B.' })
  @IsOptional()
  @IsString()
  rejectionReason?: string;
}

export class QueryClaimsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  referralId?: string;

  @ApiPropertyOptional({ enum: BillingStatus })
  @IsOptional()
  @IsEnum(BillingStatus)
  status?: BillingStatus;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  limit?: number = 20;
}
