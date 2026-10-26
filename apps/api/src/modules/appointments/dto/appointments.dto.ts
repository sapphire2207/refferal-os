import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsDateString,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BookAppointmentDto {
  @ApiProperty({ example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' })
  @IsUUID('4', { message: 'referralId must be a valid UUID' })
  @IsNotEmpty()
  referralId: string;

  @ApiProperty({ example: '2026-11-05', description: 'Scheduled date (YYYY-MM-DD)' })
  @IsDateString()
  @IsNotEmpty()
  scheduledDate: string;

  @ApiProperty({ example: '10:00 AM' })
  @IsString()
  @IsNotEmpty()
  scheduledTime: string;

  @ApiProperty({ example: 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', description: 'Nurse Practitioner UUID' })
  @IsUUID('4', { message: 'nursePractitionerId must be a valid UUID' })
  @IsNotEmpty()
  nursePractitionerId: string;

  @ApiPropertyOptional({ example: 60, default: 60 })
  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(240)
  durationMinutes?: number = 60;

  @ApiPropertyOptional({ example: '742 Evergreen Terrace, Miami, FL' })
  @IsOptional()
  @IsString()
  location?: string;
}

export class ConfirmAppointmentDto {
  @ApiPropertyOptional({ example: 'Patient confirmed availability via phone call' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CancelAppointmentDto {
  @ApiProperty({ example: 'Patient requested cancellation due to family emergency' })
  @IsString()
  @IsNotEmpty()
  reason: string;
}

export class RescheduleAppointmentDto {
  @ApiProperty({ example: '2026-11-12' })
  @IsDateString()
  @IsNotEmpty()
  newScheduledDate: string;

  @ApiProperty({ example: '02:00 PM' })
  @IsString()
  @IsNotEmpty()
  newScheduledTime: string;

  @ApiPropertyOptional({ description: 'Optional change of Nurse Practitioner' })
  @IsOptional()
  @IsUUID()
  nursePractitionerId?: string;

  @ApiProperty({ example: 'Patient rescheduled for next week' })
  @IsString()
  @IsNotEmpty()
  reason: string;
}

export class QueryAppointmentsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  referralId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  nursePractitionerId?: string;

  @ApiPropertyOptional({ example: '2026-11-05' })
  @IsOptional()
  @IsDateString()
  scheduledDate?: string;

  @ApiPropertyOptional({ enum: ['PENDING', 'CONFIRMED', 'CANCELLED'] })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
