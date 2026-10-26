import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Res,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response, Request } from 'express';
import { DocumentsService } from './documents.service';
import {
  UploadDocumentDto,
  VerifyDocumentDto,
  QueryDocumentsDto,
} from './dto/documents.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/rbac.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole, AuthTokenPayload } from '@heals/types';
import { DistributedRateLimiterService } from '../../common/services/rate-limiter.service';

@ApiTags('Documents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('documents')
export class DocumentsController {
  constructor(
    private readonly documentsService: DocumentsService,
    private readonly rateLimiter: DistributedRateLimiterService,
  ) {}

  @Post()
  @Roles(
    UserRole.INTAKE_SPECIALIST,
    UserRole.CLINICAL_COORDINATOR,
    UserRole.CLINICAL_REVIEWER,
    UserRole.OFFICE_MANAGER,
    UserRole.ADMIN,
  )
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload clinical document with magic bytes validation and private storage' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        referralId: { type: 'string' },
        type: { type: 'string', enum: ['REFERRAL_FORM', 'INSURANCE_CARD', 'CLINICAL_ORDER', 'MEDICAL_RECORD', 'IDENTIFICATION', 'CLINICAL_NOTE', 'SUPPORTING_DOCUMENT', 'OTHER'] },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Document uploaded and registered' })
  async upload(
    @Body() dto: UploadDocumentDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthTokenPayload,
    @Req() req: Request,
  ) {
    await this.rateLimiter.enforce('api-upload', req.ip || user.userId);
    return this.documentsService.uploadDocument(dto, file, user);
  }

  @Get()
  @Roles(
    UserRole.INTAKE_SPECIALIST,
    UserRole.CLINICAL_REVIEWER,
    UserRole.CLINICAL_COORDINATOR,
    UserRole.OFFICE_MANAGER,
    UserRole.SCHEDULER,
    UserRole.NURSE_PRACTITIONER,
    UserRole.BILLING_COORDINATOR,
    UserRole.ADMIN,
    UserRole.COMPLIANCE,
  )
  @ApiOperation({ summary: 'List documents with referral and status filters' })
  @ApiResponse({ status: 200, description: 'List of document records' })
  async findAll(
    @Query() query: QueryDocumentsDto,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    return this.documentsService.findAll(query, user);
  }

  @Get(':id')
  @Roles(
    UserRole.INTAKE_SPECIALIST,
    UserRole.CLINICAL_REVIEWER,
    UserRole.CLINICAL_COORDINATOR,
    UserRole.OFFICE_MANAGER,
    UserRole.SCHEDULER,
    UserRole.NURSE_PRACTITIONER,
    UserRole.BILLING_COORDINATOR,
    UserRole.ADMIN,
    UserRole.COMPLIANCE,
  )
  @ApiOperation({ summary: 'Get document metadata by ID' })
  @ApiParam({ name: 'id', description: 'Document UUID' })
  @ApiResponse({ status: 200, description: 'Document metadata' })
  @ApiResponse({ status: 404, description: 'Document not found' })
  async findById(
    @Param('id') id: string,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    return this.documentsService.findById(id, user);
  }

  @Get(':id/download')
  @Roles(
    UserRole.INTAKE_SPECIALIST,
    UserRole.CLINICAL_REVIEWER,
    UserRole.CLINICAL_COORDINATOR,
    UserRole.OFFICE_MANAGER,
    UserRole.SCHEDULER,
    UserRole.NURSE_PRACTITIONER,
    UserRole.BILLING_COORDINATOR,
    UserRole.ADMIN,
    UserRole.COMPLIANCE,
  )
  @ApiOperation({ summary: 'Stream private document with access control and safe headers' })
  @ApiParam({ name: 'id', description: 'Document UUID' })
  @ApiResponse({ status: 200, description: 'Binary file stream' })
  async download(
    @Param('id') id: string,
    @CurrentUser() user: AuthTokenPayload,
    @Res() res: Response,
  ) {
    const { stream, document } = await this.documentsService.getFileStream(id, user);

    res.setHeader('Content-Type', document.mimeType);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(document.originalFilename)}"`,
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');

    stream.pipe(res);
  }

  @Patch(':id/verify')
  @Roles(
    UserRole.CLINICAL_REVIEWER,
    UserRole.CLINICAL_COORDINATOR,
    UserRole.INTAKE_SPECIALIST,
    UserRole.ADMIN,
  )
  @ApiOperation({ summary: 'Mark document as verified and record clinical review notes' })
  @ApiParam({ name: 'id', description: 'Document UUID' })
  @ApiResponse({ status: 200, description: 'Document marked verified' })
  async verify(
    @Param('id') id: string,
    @Body() dto: VerifyDocumentDto,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    return this.documentsService.verifyDocument(id, dto, user);
  }

  @Post(':id/extract')
  @Roles(
    UserRole.INTAKE_SPECIALIST,
    UserRole.CLINICAL_COORDINATOR,
    UserRole.CLINICAL_REVIEWER,
    UserRole.ADMIN,
  )
  @ApiOperation({ summary: 'Trigger AI extraction pipeline on document' })
  @ApiParam({ name: 'id', description: 'Document UUID' })
  @ApiResponse({ status: 200, description: 'AI extraction completed' })
  async extract(
    @Param('id') id: string,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    return this.documentsService.extractDocument(id, user);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.CLINICAL_COORDINATOR)
  @ApiOperation({ summary: 'Delete document (unverified by coordinator or verified by admin)' })
  @ApiParam({ name: 'id', description: 'Document UUID' })
  @ApiResponse({ status: 200, description: 'Document removed' })
  async delete(
    @Param('id') id: string,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    return this.documentsService.deleteDocument(id, user);
  }
}
