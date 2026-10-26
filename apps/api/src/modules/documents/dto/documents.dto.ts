import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsUUID,
  IsObject,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DocumentType, ExtractionStatus } from '@heals/types';

export class UploadDocumentDto {
  @ApiProperty({ example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' })
  @IsUUID('4', { message: 'referralId must be a valid UUID' })
  @IsNotEmpty()
  referralId: string;

  @ApiProperty({
    enum: DocumentType,
    example: DocumentType.REFERRAL_FORM,
  })
  @IsEnum(DocumentType)
  @IsNotEmpty()
  type: DocumentType;
}

export class VerifyDocumentDto {
  @ApiPropertyOptional({ example: 'Patient demographics, insurance, and clinical orders confirmed manually.' })
  @IsOptional()
  @IsString()
  verificationNotes?: string;

  @ApiPropertyOptional({ description: 'Confirmed structured extraction fields', example: { coverageVerified: true } })
  @IsOptional()
  @IsObject()
  confirmedData?: Record<string, any>;
}

export class QueryDocumentsDto {
  @ApiPropertyOptional({ example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' })
  @IsOptional()
  @IsUUID()
  referralId?: string;

  @ApiPropertyOptional({ enum: DocumentType })
  @IsOptional()
  @IsEnum(DocumentType)
  type?: DocumentType;

  @ApiPropertyOptional({ enum: ExtractionStatus })
  @IsOptional()
  @IsEnum(ExtractionStatus)
  extractionStatus?: ExtractionStatus;
}
