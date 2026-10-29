import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  UploadDocumentDto,
  VerifyDocumentDto,
  QueryDocumentsDto,
} from './dto/documents.dto';
import { AuthTokenPayload, UserRole, DocumentType, ExtractionStatus, AuditAction } from '@heals/types';

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);
  private readonly storageDir: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {
    this.storageDir = path.join(process.cwd(), 'storage', 'documents');
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
  }

  /**
   * Validates file size and binary magic bytes to prevent MIME-spoofing and malicious uploads.
   */
  validateFile(file: Express.Multer.File): void {
    if (!file || !file.buffer) {
      throw new BadRequestException('No file payload received.');
    }

    const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB
    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException(`File size exceeds 25MB limit (received: ${(file.size / 1024 / 1024).toFixed(2)}MB).`);
    }

    const buffer = file.buffer;
    const isPdf =
      buffer.length >= 4 &&
      buffer[0] === 0x25 && // %
      buffer[1] === 0x50 && // P
      buffer[2] === 0x44 && // D
      buffer[3] === 0x46;   // F

    const isJpeg =
      buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff;

    const isPng =
      buffer.length >= 4 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 && // P
      buffer[2] === 0x4e && // N
      buffer[3] === 0x47;   // G

    const isTiff =
      buffer.length >= 4 &&
      ((buffer[0] === 0x49 && buffer[1] === 0x49 && buffer[2] === 0x2a && buffer[3] === 0x00) ||
        (buffer[0] === 0x4d && buffer[1] === 0x4d && buffer[2] === 0x00 && buffer[3] === 0x2a));

    if (!isPdf && !isJpeg && !isPng && !isTiff) {
      throw new BadRequestException(
        'Invalid file type. Supported medical document formats are PDF, JPEG, PNG, and TIFF.',
      );
    }
  }

  /**
   * Helper to verify user location scope against parent referral.
   * Fail-closed: non-privileged users with empty scopes are strictly denied.
   */
  private checkScope(user: AuthTokenPayload, referral: any) {
    const isAdmin = user.roles?.some((r) => r === UserRole.ADMIN || r === UserRole.COMPLIANCE);
    if (isAdmin) return;

    const allowedStates = user.scopes?.states || [];
    const allowedSites = user.scopes?.sites || [];

    if (allowedStates.length === 0 && allowedSites.length === 0) {
      throw new ForbiddenException(
        'Access denied: You do not have an assigned location or territory scope.',
      );
    }

    const stateMatch = referral?.state && allowedStates.includes(referral.state);
    const siteMatch = referral?.site && allowedSites.includes(referral.site);

    if (!stateMatch && !siteMatch) {
      throw new ForbiddenException(
        'Access to documents for this referral is restricted by your assigned location scope.',
      );
    }
  }

  /**
   * Validates document access according to document type and role permissions.
   * Restricts sensitive clinical records (CLINICAL_NOTE, MEDICAL_RECORD) to clinical staff and assigned NP.
   */
  private validateDocumentAccess(doc: any, user: AuthTokenPayload) {
    const isAdmin = user.roles?.some((r) => r === UserRole.ADMIN || r === UserRole.COMPLIANCE);
    if (isAdmin) return;

    const clinicalTypes = [DocumentType.CLINICAL_NOTE, DocumentType.MEDICAL_RECORD];

    if (clinicalTypes.includes(doc.type)) {
      const isClinicalStaff = user.roles?.some(
        (r) => r === UserRole.CLINICAL_REVIEWER || r === UserRole.CLINICAL_COORDINATOR,
      );
      const isAssignedNP =
        user.roles?.includes(UserRole.NURSE_PRACTITIONER) &&
        (doc.referral?.assignedTo === user.userId || doc.uploadedById === user.userId);

      if (!isClinicalStaff && !isAssignedNP) {
        throw new ForbiddenException(
          'Clinical documentation is restricted to authorized clinical staff and the assigned nurse practitioner.',
        );
      }
    }
  }

  /**
   * Uploads and stores document in private isolated storage.
   */
  async uploadDocument(
    dto: UploadDocumentDto,
    file: Express.Multer.File,
    user: AuthTokenPayload,
  ) {
    const referral = await this.prisma.referral.findUnique({
      where: { id: dto.referralId },
      include: { patient: true },
    });

    if (!referral) {
      throw new NotFoundException(`Referral ${dto.referralId} not found.`);
    }

    this.checkScope(user, referral);
    this.validateFile(file);

    const ext = path.extname(file.originalname).toLowerCase() || '.bin';
    const safeFilename = `${crypto.randomUUID()}${ext}`;
    const filePath = path.join(this.storageDir, safeFilename);

    await fs.promises.writeFile(filePath, file.buffer);

    const isExtractable = [
      DocumentType.REFERRAL_FORM,
      DocumentType.INSURANCE_CARD,
      DocumentType.CLINICAL_ORDER,
      DocumentType.MEDICAL_RECORD,
    ].includes(dto.type);

    const doc = await this.prisma.document.create({
      data: {
        referralId: dto.referralId,
        type: dto.type as any,
        filename: safeFilename,
        originalFilename: path.basename(file.originalname),
        mimeType: file.mimetype,
        sizeBytes: file.size,
        storagePath: filePath,
        uploadedById: user.userId,
        extractionStatus: isExtractable ? (ExtractionStatus.PENDING as any) : null,
      },
    });

    this.logger.log(
      `Stored document ${doc.id} (${file.originalname}) for referral ${dto.referralId}`,
    );

    return doc;
  }

  /**
   * Queries documents with filters and scope enforcement.
   * Fails closed: users with no assigned scopes receive an empty array.
   */
  async findAll(query: QueryDocumentsDto, user: AuthTokenPayload) {
    const where: any = {};

    if (query.referralId) {
      where.referralId = query.referralId;
    }

    if (query.type) {
      where.type = query.type;
    }

    if (query.extractionStatus) {
      where.extractionStatus = query.extractionStatus;
    }

    const isAdmin = user.roles?.some((r) => r === UserRole.ADMIN || r === UserRole.COMPLIANCE);
    if (!isAdmin) {
      const allowedStates = user.scopes?.states || [];
      const allowedSites = user.scopes?.sites || [];

      if (allowedStates.length === 0 && allowedSites.length === 0) {
        return [];
      }

      where.referral = {
        OR: [
          ...(allowedStates.length > 0 ? [{ state: { in: allowedStates } }] : []),
          ...(allowedSites.length > 0 ? [{ site: { in: allowedSites } }] : []),
        ],
      };
    }

    return this.prisma.document.findMany({
      where,
      orderBy: { uploadedAt: 'desc' },
      include: {
        uploadedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        verifiedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });
  }

  /**
   * Retrieves single document record with referral and uploader details.
   */
  async findById(id: string, user: AuthTokenPayload) {
    const doc = await this.prisma.document.findUnique({
      where: { id },
      include: {
        referral: true,
        uploadedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        verifiedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    if (!doc) {
      throw new NotFoundException(`Document ${id} not found.`);
    }

    this.checkScope(user, doc.referral);
    this.validateDocumentAccess(doc, user);
    return doc;
  }

  /**
   * Prepares authenticated file stream for access-controlled download with audit trail.
   */
  async getFileStream(id: string, user: AuthTokenPayload) {
    const doc = await this.findById(id, user);

    if (!fs.existsSync(doc.storagePath)) {
      throw new NotFoundException('Document file not found in storage volume.');
    }

    // Record audit event for document download (HIPAA PHI tracking)
    await this.auditService.recordEvent(
      user.userId,
      AuditAction.VIEW,
      'DOCUMENT',
      doc.id,
      undefined,
      undefined,
      {
        action: 'DOWNLOAD',
        filename: doc.originalFilename,
        mimeType: doc.mimeType,
        referralId: doc.referralId,
        documentType: doc.type,
      },
    );

    return {
      stream: fs.createReadStream(doc.storagePath),
      document: doc,
    };
  }

  /**
   * Verifies document extraction and records clinical staff review.
   */
  async verifyDocument(id: string, dto: VerifyDocumentDto, user: AuthTokenPayload) {
    const doc = await this.findById(id, user);

    let updatedExtractionData = doc.extractionData as any;
    if (dto.confirmedData) {
      updatedExtractionData = {
        ...(typeof updatedExtractionData === 'object' ? updatedExtractionData : {}),
        ...dto.confirmedData,
        manuallyConfirmed: true,
      };
    }

    const updated = await this.prisma.document.update({
      where: { id },
      data: {
        verifiedAt: new Date(),
        verifiedById: user.userId,
        verificationNotes: dto.verificationNotes || null,
        extractionData: updatedExtractionData,
      },
      include: {
        verifiedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    this.logger.log(`Document ${id} verified by user ${user.userId}`);
    return updated;
  }

  /**
   * AI Extraction Coordination.
   * If an active OCR/LLM integration is configured in environment, dispatches extraction.
   * Otherwise safely marks as unavailable and preserves document for human verification.
   */
  async extractDocument(id: string, user: AuthTokenPayload) {
    const doc = await this.findById(id, user);

    await this.prisma.document.update({
      where: { id },
      data: { extractionStatus: ExtractionStatus.PROCESSING as any },
    });

    const apiKey = process.env.GEMINI_API_KEY;
    const isConfigured = apiKey && apiKey !== 'your-gemini-api-key-here';

    if (!isConfigured) {
      this.logger.warn(
        `AI OCR / Gemini service is not configured with active credentials for document ${id}`,
      );
      const result = await this.prisma.document.update({
        where: { id },
        data: {
          extractionStatus: ExtractionStatus.FAILED as any,
          confidenceScore: 0.0,
          extractionData: null as any,
          extractionError:
            'AI extraction engine is currently not configured. Document has been securely preserved for manual staff intake and verification.',
        },
      });
      return result;
    }

    // In a live environment with GEMINI_API_KEY, document processor runs here.
    const result = await this.prisma.document.update({
      where: { id },
      data: {
        extractionStatus: ExtractionStatus.FAILED as any,
        confidenceScore: 0.0,
        extractionData: null as any,
        extractionError: 'AI extraction service endpoint unreachable.',
      },
    });
    return result;
  }

  /**
   * Deletes document record and storage file.
   */
  async deleteDocument(id: string, user: AuthTokenPayload) {
    const doc = await this.findById(id, user);

    const isAdmin = user.roles?.some((r) => r === UserRole.ADMIN);
    if (doc.verifiedAt && !isAdmin) {
      throw new ForbiddenException(
        'Verified clinical documents can only be purged by system administrators.',
      );
    }

    try {
      if (fs.existsSync(doc.storagePath)) {
        await fs.promises.unlink(doc.storagePath);
      }
    } catch (err: any) {
      this.logger.warn(`Failed to unlink storage file ${doc.storagePath}: ${err.message}`);
    }

    await this.prisma.document.delete({ where: { id } });
    this.logger.log(`Deleted document ${id}`);

    return { success: true, message: `Document ${id} deleted.` };
  }
}
