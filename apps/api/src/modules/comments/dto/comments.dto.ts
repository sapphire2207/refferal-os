import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength, IsArray } from 'class-validator';

export class CreateCommentDto {
  @ApiProperty({
    description: 'Internal comment text for referral workflow collaboration',
    example: 'Spoke with primary care provider Dr. House. Confirmed patient is homebound.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  content: string;

  @ApiPropertyOptional({
    description: 'Array of user IDs or mention handles tagged in this comment',
    example: ['user-np-123'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mentions?: string[];
}

