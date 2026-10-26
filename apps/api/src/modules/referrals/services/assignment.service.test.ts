import { Test, TestingModule } from '@nestjs/testing';
import { AssignmentService } from './assignment.service';
import { PrismaService } from '../../../database/prisma.service';
import { PipelineStage, UserRole } from '@heals/types';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Referral } from '@prisma/client';

describe('AssignmentService', () => {
  let service: AssignmentService;
  let prismaService: jest.Mocked<PrismaService>;

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
    },
    referral: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    encounter: {
      findFirst: jest.fn(),
    },
    referralAssignment: {
      updateMany: jest.fn(),
      create: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssignmentService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<AssignmentService>(AssignmentService);
    prismaService = module.get(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('determineAssignment', () => {
    const baseReferral = {
      id: 'ref-1',
      site: 'Site-A',
      state: 'FL',
      legalEntity: 'HEALS_FL',
    } as unknown as Referral;

    it('should assign to primary role queue for INTAKE stage', async () => {
      const assignment = await service.determineAssignment(
        baseReferral,
        PipelineStage.INTAKE,
      );

      expect(assignment.role).toBe(UserRole.INTAKE_SPECIALIST);
      expect(assignment.userId).toBeUndefined();
    });

    it('should assign to CLINICAL_REVIEWER for CLINICAL_REVIEW stage', async () => {
      const assignment = await service.determineAssignment(
        baseReferral,
        PipelineStage.CLINICAL_REVIEW,
      );

      expect(assignment.role).toBe(UserRole.CLINICAL_REVIEWER);
      expect(assignment.userId).toBeUndefined();
    });

    it('should assign to SCHEDULER for SCHEDULING stage', async () => {
      const assignment = await service.determineAssignment(
        baseReferral,
        PipelineStage.SCHEDULING,
      );

      expect(assignment.role).toBe(UserRole.SCHEDULER);
      expect(assignment.userId).toBeUndefined();
    });

    it('should use explicit targetUserId if provided in metadata', async () => {
      const assignment = await service.determineAssignment(
        baseReferral,
        PipelineStage.SCHEDULING,
        { targetUserId: 'user-explicit-123' },
      );

      expect(assignment.role).toBe(UserRole.SCHEDULER);
      expect(assignment.userId).toBe('user-explicit-123');
    });

    it('should route to original NP for NP_VISIT stage if originalNpId provided in metadata', async () => {
      const assignment = await service.determineAssignment(
        baseReferral,
        PipelineStage.NP_VISIT,
        { originalNpId: 'np-original-1' },
      );

      expect(assignment.role).toBe(UserRole.NURSE_PRACTITIONER);
      expect(assignment.userId).toBe('np-original-1');
    });

    it('should lookup original NP from latest encounter if returning to NP_VISIT without metadata', async () => {
      (mockPrismaService.encounter.findFirst as jest.Mock).mockResolvedValue({
        id: 'enc-1',
        referralId: 'ref-1',
        nursePractitionerId: 'np-from-db-1',
      });

      const assignment = await service.determineAssignment(
        baseReferral,
        PipelineStage.NP_VISIT,
      );

      expect(mockPrismaService.encounter.findFirst).toHaveBeenCalledWith({
        where: { referralId: 'ref-1' },
        orderBy: { createdAt: 'desc' },
      });
      expect(assignment.role).toBe(UserRole.NURSE_PRACTITIONER);
      expect(assignment.userId).toBe('np-from-db-1');
    });

    it('should route to original intake specialist if returning to INTAKE with originalIntakeUserId', async () => {
      const assignment = await service.determineAssignment(
        baseReferral,
        PipelineStage.INTAKE,
        { originalIntakeUserId: 'intake-specialist-1' },
      );

      expect(assignment.role).toBe(UserRole.INTAKE_SPECIALIST);
      expect(assignment.userId).toBe('intake-specialist-1');
    });
  });

  describe('assignToUser', () => {
    const mockUser = {
      id: 'user-1',
      isActive: true,
      userRoles: [{ role: 'INTAKE_SPECIALIST' }],
      userScopes: [
        { site: 'Site-A', state: 'FL', legalEntity: 'HEALS_FL' },
      ],
    };

    const mockReferral = {
      id: 'ref-1',
      pipelineStage: 'INTAKE',
      site: 'Site-A',
      state: 'FL',
      legalEntity: 'HEALS_FL',
    };

    it('should successfully assign to user with valid scope and update history', async () => {
      (mockPrismaService.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (mockPrismaService.referral.findUnique as jest.Mock).mockResolvedValue(mockReferral);
      (mockPrismaService.referralAssignment.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      (mockPrismaService.referralAssignment.create as jest.Mock).mockResolvedValue({ id: 'assign-1' });
      (mockPrismaService.referral.update as jest.Mock).mockResolvedValue({ ...mockReferral, assignedTo: 'user-1' });

      await service.assignToUser('ref-1', 'user-1', 'Initial assignment', 'admin-1');

      // Closes previous assignment
      expect(mockPrismaService.referralAssignment.updateMany).toHaveBeenCalledWith({
        where: { referralId: 'ref-1', unassignedAt: null },
        data: {
          unassignedAt: expect.any(Date),
          reason: 'Initial assignment',
        },
      });

      // Creates new assignment record
      expect(mockPrismaService.referralAssignment.create).toHaveBeenCalledWith({
        data: {
          referralId: 'ref-1',
          userId: 'user-1',
          role: 'INTAKE_SPECIALIST',
          assignedAt: expect.any(Date),
          assignedBy: 'admin-1',
          reason: 'Initial assignment',
        },
      });

      // Updates referral
      expect(mockPrismaService.referral.update).toHaveBeenCalledWith({
        where: { id: 'ref-1' },
        data: {
          assignedTo: 'user-1',
          assignedRole: 'INTAKE_SPECIALIST',
        },
      });
    });

    it('should allow ADMIN user regardless of scope', async () => {
      const adminUser = {
        id: 'admin-user',
        isActive: true,
        userRoles: [{ role: 'ADMIN' }],
        userScopes: [], // no explicit scopes
      };

      (mockPrismaService.user.findUnique as jest.Mock).mockResolvedValue(adminUser);
      (mockPrismaService.referral.findUnique as jest.Mock).mockResolvedValue(mockReferral);
      (mockPrismaService.referralAssignment.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
      (mockPrismaService.referralAssignment.create as jest.Mock).mockResolvedValue({ id: 'assign-2' });
      (mockPrismaService.referral.update as jest.Mock).mockResolvedValue({ ...mockReferral, assignedTo: 'admin-user' });

      await expect(
        service.assignToUser('ref-1', 'admin-user', 'Admin override'),
      ).resolves.not.toThrow();
    });

    it('should throw NotFoundException if user does not exist', async () => {
      (mockPrismaService.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.assignToUser('ref-1', 'nonexistent', 'test'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if user is inactive', async () => {
      (mockPrismaService.user.findUnique as jest.Mock).mockResolvedValue({
        ...mockUser,
        isActive: false,
      });

      await expect(
        service.assignToUser('ref-1', 'user-1', 'test'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if referral does not exist', async () => {
      (mockPrismaService.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (mockPrismaService.referral.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.assignToUser('nonexistent-ref', 'user-1', 'test'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if user lacks site scope', async () => {
      const scopedUser = {
        ...mockUser,
        userScopes: [{ site: 'Site-B', state: 'FL', legalEntity: 'HEALS_FL' }],
      };
      (mockPrismaService.user.findUnique as jest.Mock).mockResolvedValue(scopedUser);
      (mockPrismaService.referral.findUnique as jest.Mock).mockResolvedValue(mockReferral);

      await expect(
        service.assignToUser('ref-1', 'user-1', 'test'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if user lacks state scope', async () => {
      const scopedUser = {
        ...mockUser,
        userScopes: [{ site: 'Site-A', state: 'GA', legalEntity: 'HEALS_FL' }],
      };
      (mockPrismaService.user.findUnique as jest.Mock).mockResolvedValue(scopedUser);
      (mockPrismaService.referral.findUnique as jest.Mock).mockResolvedValue(mockReferral);

      await expect(
        service.assignToUser('ref-1', 'user-1', 'test'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if user lacks legalEntity scope', async () => {
      const scopedUser = {
        ...mockUser,
        userScopes: [{ site: 'Site-A', state: 'FL', legalEntity: 'HEALS_GA' }],
      };
      (mockPrismaService.user.findUnique as jest.Mock).mockResolvedValue(scopedUser);
      (mockPrismaService.referral.findUnique as jest.Mock).mockResolvedValue(mockReferral);

      await expect(
        service.assignToUser('ref-1', 'user-1', 'test'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should use transaction client if provided', async () => {
      const mockTx = {
        referral: {
          findUnique: jest.fn().mockResolvedValue(mockReferral),
          update: jest.fn().mockResolvedValue(mockReferral),
        },
        referralAssignment: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          create: jest.fn().mockResolvedValue({ id: 'assign-tx' }),
        },
      } as unknown as any;

      (mockPrismaService.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      await service.assignToUser('ref-1', 'user-1', 'Tx test', 'admin-1', mockTx);

      expect(mockTx.referral.findUnique).toHaveBeenCalled();
      expect(mockTx.referralAssignment.updateMany).toHaveBeenCalled();
      expect(mockTx.referralAssignment.create).toHaveBeenCalled();
      expect(mockTx.referral.update).toHaveBeenCalled();
      expect(mockPrismaService.referral.update).not.toHaveBeenCalled();
    });
  });

  describe('assignToRoleQueue', () => {
    it('should clear assignedTo and set assignedRole while closing previous assignment', async () => {
      (mockPrismaService.referralAssignment.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      (mockPrismaService.referral.update as jest.Mock).mockResolvedValue({ id: 'ref-1' });

      await service.assignToRoleQueue(
        'ref-1',
        UserRole.SCHEDULER,
        'Returned to queue',
        'supervisor-1',
      );

      expect(mockPrismaService.referralAssignment.updateMany).toHaveBeenCalledWith({
        where: { referralId: 'ref-1', unassignedAt: null },
        data: {
          unassignedAt: expect.any(Date),
          reason: 'Returned to queue',
        },
      });

      expect(mockPrismaService.referral.update).toHaveBeenCalledWith({
        where: { id: 'ref-1' },
        data: {
          assignedTo: null,
          assignedRole: UserRole.SCHEDULER,
        },
      });
    });

    it('should use transaction client if provided for queue assignment', async () => {
      const mockTx = {
        referralAssignment: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        referral: {
          update: jest.fn().mockResolvedValue({ id: 'ref-1' }),
        },
      } as unknown as any;

      await service.assignToRoleQueue(
        'ref-1',
        UserRole.BILLING_COORDINATOR,
        'Tx queue test',
        undefined,
        mockTx,
      );

      expect(mockTx.referralAssignment.updateMany).toHaveBeenCalled();
      expect(mockTx.referral.update).toHaveBeenCalled();
      expect(mockPrismaService.referral.update).not.toHaveBeenCalled();
    });
  });
});
