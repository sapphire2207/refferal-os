import { IsString, IsOptional, IsNumber } from 'class-validator';

export class ForwardToReviewDto {
  @IsNumber()
  version: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class ReviewDecisionDto {
  @IsNumber()
  version: number;

  @IsString()
  decision: 'ACCEPT' | 'SEND_BACK' | 'REJECT';

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
