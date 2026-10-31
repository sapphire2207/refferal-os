import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  CreatePatientDto,
  UpdatePatientDto,
  QueryPatientsDto,
  CheckDuplicatePatientDto,
  DuplicateMatchResult,
} from './dto/patients.dto';
import { AuthTokenPayload, UserRole } from '@heals/types';

@Injectable()
export class PatientsService {
  private readonly logger = new Logger(PatientsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) { }

  /**
   * Normalized phone digits for fuzzy comparison.
   */
  private normalizePhone(phone?: string | null): string {
    if (!phone) return '';
    return phone.replace(/\D/g, '');
  }

  /**
   * Levenshtein Distance algorithm for typographical similarity detection.
   */
  private levenshteinDistance(s1: string, s2: string): number {
    const a = s1.toLowerCase();
    const b = s2.toLowerCase();
    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            Math.min(
              matrix[i][j - 1] + 1, // insertion
              matrix[i - 1][j] + 1, // deletion
            ),
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }

  /**
   * Multi-criteria patient deduplication engine.
   * Matches on:
   * 1. Exact MRN (100% confidence)
   * 2. Full Name + DOB + Phone (High confidence)
   * 3. Fuzzy Name + DOB (Medium-High confidence)
   * 4. DOB + Shared Last Name (Potential family match)
   */
  async checkDuplicates(candidate: CheckDuplicatePatientDto): Promise<DuplicateMatchResult[]> {
    const resultsMap = new Map<string, DuplicateMatchResult>();
    const candidateDob = new Date(candidate.dateOfBirth);
    const candidatePhoneNorm = this.normalizePhone(candidate.phone);
    const candidateFirst = candidate.firstName.trim().toLowerCase();
    const candidateLast = candidate.lastName.trim().toLowerCase();

    // 1. Exact MRN Check
    if (candidate.medicalRecordNumber) {
      const mrnMatches = await this.prisma.patient.findMany({
        where: {
          medicalRecordNumber: {
            equals: candidate.medicalRecordNumber.trim(),
            mode: 'insensitive',
          },
        },
      });

      for (const match of mrnMatches) {
        resultsMap.set(match.id, {
          patient: match,
          matchScore: 1.0,
          matchLevel: 'EXACT',
          matchReasons: ['Exact Medical Record Number (MRN) match'],
        });
      }
    }

    // 2. Query potential candidates matching DOB, Phone, or Last Name
    const candidates = await this.prisma.patient.findMany({
      where: {
        OR: [
          { dateOfBirth: candidateDob },
          ...(candidate.phone ? [{ phone: { contains: candidate.phone.trim() } }] : []),
          { lastName: { equals: candidate.lastName.trim(), mode: 'insensitive' } },
        ],
      },
      take: 20,
    });

    for (const patient of candidates) {
      if (resultsMap.has(patient.id)) continue;

      const pDob = new Date(patient.dateOfBirth);
      const dobMatches = pDob.toISOString().split('T')[0] === candidateDob.toISOString().split('T')[0];
      const pFirst = patient.firstName.trim().toLowerCase();
      const pLast = patient.lastName.trim().toLowerCase();
      const pPhoneNorm = this.normalizePhone(patient.phone);

      const firstDist = this.levenshteinDistance(candidateFirst, pFirst);
      const lastDist = this.levenshteinDistance(candidateLast, pLast);
      const firstNameExact = firstDist === 0;
      const lastNameExact = lastDist === 0;
      const nameFuzzy = firstDist <= 1 && lastDist <= 1;
      const phoneMatches = candidatePhoneNorm.length >= 7 && pPhoneNorm.length >= 7 && candidatePhoneNorm === pPhoneNorm;

      let score = 0;
      const reasons: string[] = [];

      if (dobMatches && firstNameExact && lastNameExact) {
        score = 0.98;
        reasons.push('Identical Date of Birth, First Name, and Last Name');
        if (phoneMatches) {
          score = 1.0;
          reasons.push('Matching Phone Number');
        }
      } else if (dobMatches && nameFuzzy) {
        score = 0.90;
        reasons.push('Identical Date of Birth with typographical similarity in Name');
        if (phoneMatches) {
          score = 0.95;
          reasons.push('Matching Phone Number');
        }
      } else if (dobMatches && phoneMatches && (firstNameExact || lastNameExact)) {
        score = 0.92;
        reasons.push('Identical Date of Birth and Phone Number with partial Name match');
      } else if (dobMatches && lastNameExact) {
        score = 0.65;
        reasons.push('Identical Date of Birth and Last Name (possible duplicate or twin)');
      } else if (phoneMatches && lastNameExact) {
        score = 0.55;
        reasons.push('Matching Phone Number and Last Name (shared household)');
      }

      if (score >= 0.50) {
        const matchLevel: 'EXACT' | 'HIGH_PROBABILITY' | 'POTENTIAL' =
          score >= 0.98 ? 'EXACT' : score >= 0.85 ? 'HIGH_PROBABILITY' : 'POTENTIAL';

        resultsMap.set(patient.id, {
          patient,
          matchScore: score,
          matchLevel,
          matchReasons: reasons,
        });
      }
    }

    return Array.from(resultsMap.values()).sort((a, b) => b.matchScore - a.matchScore);
  }

  /**
   * Helper to verify if user has scope authorization for patient.
   */
  private checkScopeAuthorization(user: AuthTokenPayload, patientState?: string | null, referrals?: any[]) {
    const isAdmin = user.roles?.some((r) => r === UserRole.ADMIN || r === UserRole.COMPLIANCE);
    if (isAdmin) return;

    const allowedStates = user.scopes?.states || [];
    const allowedSites = user.scopes?.sites || [];

    const isUnrestricted =
      allowedStates.includes('ALL') ||
      allowedSites.includes('ALL') ||
      allowedStates.includes('*') ||
      allowedSites.includes('*');

    if (isUnrestricted) return;

    if (allowedStates.length === 0 && allowedSites.length === 0) {
      throw new ForbiddenException(
        'Access denied: You do not have an assigned location or territory scope.',
      );
    }

    // Check patient residence state
    if (patientState && allowedStates.includes(patientState)) {
      return;
    }

    // Check linked referrals site/state
    if (referrals && referrals.length > 0) {
      const hasMatchingReferral = referrals.some(
        (r) =>
          (r.state && allowedStates.includes(r.state)) ||
          (r.site && allowedSites.includes(r.site)),
      );
      if (hasMatchingReferral) return;
    }

    throw new ForbiddenException(
      'Access to patient record is restricted by your geographic/site authorization scope.',
    );
  }

  /**
   * Creates a new patient record, enforcing duplicate safety checks.
   */
  async create(dto: CreatePatientDto, user?: AuthTokenPayload) {
    if (!dto.forceCreate) {
      const duplicates = await this.checkDuplicates({
        firstName: dto.firstName,
        lastName: dto.lastName,
        dateOfBirth: dto.dateOfBirth,
        medicalRecordNumber: dto.medicalRecordNumber,
        phone: dto.phone,
      });

      const highProbMatch = duplicates.find(
        (d) => d.matchLevel === 'EXACT' || d.matchLevel === 'HIGH_PROBABILITY',
      );

      if (highProbMatch) {
        throw new ConflictException({
          message: 'Potential duplicate patient record detected. Please review existing patient.',
          duplicates,
        });
      }
    }

    const patient = await this.prisma.patient.create({
      data: {
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        dateOfBirth: new Date(dto.dateOfBirth),
        medicalRecordNumber: dto.medicalRecordNumber?.trim() || null,
        phone: dto.phone?.trim() || null,
        email: dto.email?.trim().toLowerCase() || null,
        addressLine1: dto.addressLine1?.trim() || null,
        addressLine2: dto.addressLine2?.trim() || null,
        city: dto.city?.trim() || null,
        state: dto.state?.trim().toUpperCase() || null,
        zipCode: dto.zipCode?.trim() || null,
      },
    });

    this.logger.log(`Created new patient record ID: ${patient.id} (${patient.firstName} ${patient.lastName})`);

    return patient;
  }

  /**
   * Retrieves a paginated list of patients with search and scope filtering.
   */
  async findAll(query: QueryPatientsDto, user?: AuthTokenPayload) {
    const page = query.page && query.page > 0 ? Number(query.page) : 1;
    const limit = query.limit && query.limit > 0 ? Number(query.limit) : 20;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.search) {
      where.OR = [
        { firstName: { contains: query.search, mode: 'insensitive' } },
        { lastName: { contains: query.search, mode: 'insensitive' } },
        { medicalRecordNumber: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.dob) {
      where.dateOfBirth = new Date(query.dob);
    }

    if (query.city) {
      where.city = { contains: query.city, mode: 'insensitive' };
    }

    // Apply geographic scoping for non-admin users
    if (user) {
      const isAdmin = user.roles?.some((r) => r === UserRole.ADMIN || r === UserRole.COMPLIANCE);
      if (!isAdmin) {
        const allowedStates = user.scopes?.states || [];
        const allowedSites = user.scopes?.sites || [];

        const isUnrestricted =
          allowedStates.includes('ALL') ||
          allowedSites.includes('ALL') ||
          allowedStates.includes('*') ||
          allowedSites.includes('*');

        if (!isUnrestricted) {
          if (allowedStates.length === 0 && allowedSites.length === 0) {
            return {
              data: [],
              total: 0,
              page,
              limit,
              totalPages: 0,
            };
          }

          if (query.state) {
            const reqState = query.state.toUpperCase();
            if (allowedStates.length > 0 && !allowedStates.includes(reqState)) {
              return {
                data: [],
                total: 0,
                page,
                limit,
                totalPages: 0,
              };
            }
            where.state = reqState;
          } else if (allowedStates.length > 0) {
            where.state = { in: allowedStates };
          } else if (allowedSites.length > 0) {
            where.referrals = { some: { site: { in: allowedSites } } };
          }
        } else {
          if (query.state) {
            where.state = query.state.toUpperCase();
          }
        }
      } else {
        if (query.state) {
          where.state = query.state.toUpperCase();
        }
      }
    } else {
      if (query.state) {
        where.state = query.state.toUpperCase();
      }
    }

    const [total, data] = await Promise.all([
      this.prisma.patient.count({ where }),
      this.prisma.patient.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Retrieves a patient by ID including full referral history, with scope verification.
   */
  async findById(id: string, user?: AuthTokenPayload) {
    const patient = await this.prisma.patient.findUnique({
      where: { id },
      include: {
        referrals: {
          select: {
            id: true,
            pipelineStage: true,
            workStatus: true,
            caseOutcome: true,
            priority: true,
            site: true,
            state: true,
            legalEntity: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!patient) {
      throw new NotFoundException(`Patient with ID ${id} not found`);
    }

    if (user) {
      this.checkScopeAuthorization(user, patient.state, patient.referrals);
      await this.auditService.logPhiAccess(
        user.userId,
        'PATIENT',
        patient.id,
        `Patient record accessed (${patient.firstName.slice(0, 1)}. ${patient.lastName})`,
      );
    }

    return patient;
  }

  /**
   * Updates an existing patient record.
   */
  async update(id: string, dto: UpdatePatientDto, user?: AuthTokenPayload) {
    const existing = await this.findById(id, user);

    const updated = await this.prisma.patient.update({
      where: { id },
      data: {
        ...(dto.firstName && { firstName: dto.firstName.trim() }),
        ...(dto.lastName && { lastName: dto.lastName.trim() }),
        ...(dto.dateOfBirth && { dateOfBirth: new Date(dto.dateOfBirth) }),
        ...(dto.medicalRecordNumber !== undefined && { medicalRecordNumber: dto.medicalRecordNumber?.trim() || null }),
        ...(dto.phone !== undefined && { phone: dto.phone?.trim() || null }),
        ...(dto.email !== undefined && { email: dto.email?.trim().toLowerCase() || null }),
        ...(dto.addressLine1 !== undefined && { addressLine1: dto.addressLine1?.trim() || null }),
        ...(dto.addressLine2 !== undefined && { addressLine2: dto.addressLine2?.trim() || null }),
        ...(dto.city !== undefined && { city: dto.city?.trim() || null }),
        ...(dto.state !== undefined && { state: dto.state?.trim().toUpperCase() || null }),
        ...(dto.zipCode !== undefined && { zipCode: dto.zipCode?.trim() || null }),
      },
    });

    this.logger.log(`Updated patient record ID: ${id}`);
    return updated;
  }

  /**
   * Deletes a patient record only if no active medical referral history exists.
   */
  async delete(id: string, user?: AuthTokenPayload) {
    await this.findById(id, user);

    const referralCount = await this.prisma.referral.count({
      where: { patientId: id },
    });

    if (referralCount > 0) {
      throw new BadRequestException(
        `Cannot delete patient record: ${referralCount} associated referral records exist. Medical history must be retained for clinical and compliance requirements.`,
      );
    }

    await this.prisma.patient.delete({ where: { id } });
    this.logger.log(`Deleted patient record ID: ${id}`);

    return { success: true, message: `Patient ${id} deleted successfully.` };
  }
}
