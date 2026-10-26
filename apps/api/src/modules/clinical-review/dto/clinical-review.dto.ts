import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsUUID,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ClinicalReviewDecision } from '@heals/types';

export class CreateClinicalReviewDto {
  @ApiProperty({ example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' })
  @IsUUID('4', { message: 'referralId must be a valid UUID' })
  @IsNotEmpty()
  referralId: string;

  @ApiProperty({
    enum: ClinicalReviewDecision,
    example: ClinicalReviewDecision.ACCEPT,
  })
  @IsEnum(ClinicalReviewDecision)
  @IsNotEmpty()
  decision: ClinicalReviewDecision;

  @ApiPropertyOptional({
    description: 'Required if returning or rejecting referral',
    example: 'Missing physician signature on clinical order.',
  })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({
    description: 'Clinical justification and review notes',
    example: 'Patient qualifies for homebound mobile evaluation. Risk tier moderate.',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class QueryClinicalReviewsDto {
  @ApiPropertyOptional({ example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' })
  @IsOptional()
  @IsUUID()
  referralId?: string;

  @ApiPropertyOptional({ example: 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22' })
  @IsOptional()
  @IsUUID()
  reviewerId?: string;

  @ApiPropertyOptional({ enum: ClinicalReviewDecision })
  @IsOptional()
  @IsEnum(ClinicalReviewDecision)
  decision?: ClinicalReviewDecision;
}
