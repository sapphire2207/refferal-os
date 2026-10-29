import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PatientsService } from './patients.service';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UserRole, AuthTokenPayload } from '@heals/types';

describe('PatientsService', () => {
  let service: PatientsService;
  let prisma: any;

  const mockPatient = {
    id: 'pat-101',
    firstName: 'Eleanor',
    lastName: 'Vance',
    dateOfBirth: new Date('1954-08-12'),
    medicalRecordNumber: 'MRN-884920',
    phone: '305-555-0199',
    email: 'eleanor@example.com',
    addressLine1: '742 Evergreen Terrace',
    city: 'Miami',
    state: 'FL',
    zipCode: '33101',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-02'),
    referrals: [],
  };

  const adminUser: AuthTokenPayload = {
    userId: 'admin-1',
    email: 'admin@heals.com',
    roles: [UserRole.ADMIN],
    scopes: { sites: [], states: [], legalEntities: [] },
    sessionId: 'sess-1',
    iat: 1,
    exp: 999999,
  };

  const flStaffUser: AuthTokenPayload = {
    userId: 'staff-fl',
    email: 'staff@heals.com',
    roles: [UserRole.INTAKE_SPECIALIST],
    scopes: { sites: ['FL-MIAMI'], states: ['FL'], legalEntities: [] },
    sessionId: 'sess-2',
    iat: 1,
    exp: 999999,
  };

  const gaStaffUser: AuthTokenPayload = {
    userId: 'staff-ga',
    email: 'ga@heals.com',
    roles: [UserRole.INTAKE_SPECIALIST],
    scopes: { sites: ['GA-ATLANTA'], states: ['GA'], legalEntities: [] },
    sessionId: 'sess-3',
    iat: 1,
    exp: 999999,
  };

  beforeEach(async () => {
    prisma = {
      patient: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      referral: {
        count: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PatientsService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: AuditService,
          useValue: {
            recordEvent: jest.fn().mockResolvedValue({ id: 'audit-pat-1' }),
            logPhiAccess: jest.fn().mockResolvedValue({ id: 'audit-pat-1' }),
          },
        },
      ],
    }).compile();

    service = module.get<PatientsService>(PatientsService);
  });

  describe('checkDuplicates', () => {
    it('should detect exact match by Medical Record Number (MRN)', async () => {
      prisma.patient.findMany
        .mockResolvedValueOnce([mockPatient]) // exact MRN query
        .mockResolvedValueOnce([]); // candidate query

      const results = await service.checkDuplicates({
        firstName: 'Different',
        lastName: 'Name',
        dateOfBirth: '1980-01-01',
        medicalRecordNumber: 'MRN-884920',
      });

      expect(results).toHaveLength(1);
      expect(results[0].matchLevel).toBe('EXACT');
      expect(results[0].matchScore).toBe(1.0);
      expect(results[0].matchReasons).toContain('Exact Medical Record Number (MRN) match');
    });

    it('should detect exact match by DOB, First Name, and Last Name', async () => {
      prisma.patient.findMany.mockResolvedValue([mockPatient]);

      const results = await service.checkDuplicates({
        firstName: 'Eleanor',
        lastName: 'Vance',
        dateOfBirth: '1954-08-12',
        phone: '305-555-0199',
      });

      expect(results).toHaveLength(1);
      expect(results[0].matchLevel).toBe('EXACT');
      expect(results[0].matchScore).toBe(1.0);
      expect(results[0].matchReasons).toContain('Identical Date of Birth, First Name, and Last Name');
      expect(results[0].matchReasons).toContain('Matching Phone Number');
    });

    it('should detect high probability duplicate on fuzzy name + exact DOB', async () => {
      prisma.patient.findMany.mockResolvedValue([mockPatient]);

      // Typo in first name 'Elenor' instead of 'Eleanor'
      const results = await service.checkDuplicates({
        firstName: 'Elenor',
        lastName: 'Vance',
        dateOfBirth: '1954-08-12',
      });

      expect(results).toHaveLength(1);
      expect(results[0].matchLevel).toBe('HIGH_PROBABILITY');
      expect(results[0].matchScore).toBeGreaterThanOrEqual(0.85);
      expect(results[0].matchReasons[0]).toContain('typographical similarity');
    });

    it('should detect potential match on shared phone and last name', async () => {
      prisma.patient.findMany.mockResolvedValue([mockPatient]);

      // Different DOB (e.g. spouse or relative sharing home phone)
      const results = await service.checkDuplicates({
        firstName: 'Thomas',
        lastName: 'Vance',
        dateOfBirth: '1985-04-20',
        phone: '(305) 555-0199',
      });

      expect(results).toHaveLength(1);
      expect(results[0].matchLevel).toBe('POTENTIAL');
      expect(results[0].matchScore).toBe(0.55);
      expect(results[0].matchReasons[0]).toContain('shared household');
    });
  });

  describe('create', () => {
    it('should throw ConflictException if duplicate detected and forceCreate is false', async () => {
      prisma.patient.findMany.mockResolvedValue([mockPatient]);

      await expect(
        service.create({
          firstName: 'Eleanor',
          lastName: 'Vance',
          dateOfBirth: '1954-08-12',
          phone: '305-555-0199',
        }),
      ).rejects.toThrow(ConflictException);

      expect(prisma.patient.create).not.toHaveBeenCalled();
    });

    it('should allow creation if forceCreate is true even with potential duplicate', async () => {
      prisma.patient.create.mockResolvedValue(mockPatient);

      const result = await service.create({
        firstName: 'Eleanor',
        lastName: 'Vance',
        dateOfBirth: '1954-08-12',
        forceCreate: true,
      });

      expect(result.id).toBe(mockPatient.id);
      expect(prisma.patient.create).toHaveBeenCalled();
    });

    it('should create patient smoothly when no duplicates exist', async () => {
      prisma.patient.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      prisma.patient.create.mockResolvedValue(mockPatient);

      const result = await service.create({
        firstName: 'Eleanor',
        lastName: 'Vance',
        dateOfBirth: '1954-08-12',
      });

      expect(result.id).toBe(mockPatient.id);
      expect(prisma.patient.create).toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should return paginated patients', async () => {
      prisma.patient.count.mockResolvedValue(1);
      prisma.patient.findMany.mockResolvedValue([mockPatient]);

      const result = await service.findAll({ page: 1, limit: 10, search: 'Eleanor' }, adminUser);

      expect(result.total).toBe(1);
      expect(result.data).toHaveLength(1);
      expect(prisma.patient.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.any(Array),
          }),
        }),
      );
    });

    it('should restrict search by state scope for regional staff', async () => {
      prisma.patient.count.mockResolvedValue(1);
      prisma.patient.findMany.mockResolvedValue([mockPatient]);

      await service.findAll({ page: 1, limit: 10 }, flStaffUser);

      expect(prisma.patient.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            state: { in: ['FL'] },
          }),
        }),
      );
    });
  });

  describe('findById', () => {
    it('should return patient and referral history when user is authorized', async () => {
      prisma.patient.findUnique.mockResolvedValue(mockPatient);

      const patient = await service.findById(mockPatient.id, flStaffUser);
      expect(patient.id).toBe(mockPatient.id);
    });

    it('should throw ForbiddenException if user geographic scope does not match', async () => {
      prisma.patient.findUnique.mockResolvedValue(mockPatient); // patient state is FL

      // gaStaffUser is only authorized for GA
      await expect(service.findById(mockPatient.id, gaStaffUser)).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if patient does not exist', async () => {
      prisma.patient.findUnique.mockResolvedValue(null);

      await expect(service.findById('non-existent', adminUser)).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update patient demographics', async () => {
      prisma.patient.findUnique.mockResolvedValue(mockPatient);
      prisma.patient.update.mockResolvedValue({
        ...mockPatient,
        phone: '305-999-0000',
      });

      const updated = await service.update(mockPatient.id, { phone: '305-999-0000' }, adminUser);
      expect(updated.phone).toBe('305-999-0000');
    });
  });

  describe('delete', () => {
    it('should throw BadRequestException if patient has active referrals', async () => {
      prisma.patient.findUnique.mockResolvedValue(mockPatient);
      prisma.referral.count.mockResolvedValue(2); // 2 referrals exist!

      await expect(service.delete(mockPatient.id, adminUser)).rejects.toThrow(BadRequestException);
      expect(prisma.patient.delete).not.toHaveBeenCalled();
    });

    it('should delete patient if no referrals exist', async () => {
      prisma.patient.findUnique.mockResolvedValue(mockPatient);
      prisma.referral.count.mockResolvedValue(0);
      prisma.patient.delete.mockResolvedValue(mockPatient);

      const result = await service.delete(mockPatient.id, adminUser);
      expect(result.success).toBe(true);
      expect(prisma.patient.delete).toHaveBeenCalledWith({ where: { id: mockPatient.id } });
    });
  });
});
