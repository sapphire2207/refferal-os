import { Test, TestingModule } from '@nestjs/testing';
import { ReferralsController } from './referrals.controller';
import { ReferralsService } from './services/referrals.service';
import { WorkflowService } from './services/workflow.service';
import { WorkflowExceptionFilter } from './filters/workflow-exception.filter';
import {
  AuthTokenPayload,
  UserRole,
  PipelineStage,
  WorkStatus,
} from '@heals/types';
import {
  VersionConflictException,
  WorkflowValidationException,
} from './exceptions/workflow.exceptions';
import { HttpStatus, NotFoundException, ForbiddenException } from '@nestjs/common';

describe('ReferralsController', () => {
  let controller: ReferralsController;
  let referralsService: jest.Mocked<ReferralsService>;
  let workflowService: jest.Mocked<WorkflowService>;

  const mockUser: AuthTokenPayload = {
    userId: 'user-ctrl-1',
    email: 'user@heals.com',
    sessionId: 'session-1',
    iat: 1000000,
    exp: 2000000,
    roles: [UserRole.INTAKE_SPECIALIST],
    scopes: { sites: ['Site-A'], states: ['FL'], legalEntities: ['HEALS_FL'] },
  };

  const mockReferral = {
    id: 'b1234567-89ab-4cde-8f01-23456789abcd',
    patientId: 'patient-1',
    pipelineStage: PipelineStage.INTAKE,
    workStatus: WorkStatus.PENDING,
    version: 1,
  };

  beforeEach(async () => {
    const mockReferralsService = {
      create: jest.fn(),
      findMany: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      getDashboardMetrics: jest.fn(),
    };

    const mockWorkflowService = {
      executeTransition: jest.fn(),
      updateWorkStatus: jest.fn(),
      assignReferral: jest.fn(),
      getWorkflowHistory: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReferralsController],
      providers: [
        { provide: ReferralsService, useValue: mockReferralsService },
        { provide: WorkflowService, useValue: mockWorkflowService },
      ],
    }).compile();

    controller = module.get<ReferralsController>(ReferralsController);
    referralsService = module.get(ReferralsService);
    workflowService = module.get(WorkflowService);
  });

  describe('create', () => {
    it('should delegate to referralsService.create', async () => {
      referralsService.create.mockResolvedValue(mockReferral as any);

      const dto = { patientId: 'patient-1' };
      const result = await controller.create(dto as any, mockUser);

      expect(referralsService.create).toHaveBeenCalledWith(dto, mockUser);
      expect(result).toEqual(mockReferral);
    });
  });

  describe('findMany', () => {
    it('should delegate to referralsService.findMany', async () => {
      referralsService.findMany.mockResolvedValue({
        data: [mockReferral as any],
        total: 1,
        limit: 20,
        offset: 0,
      });

      const query = { limit: 20, offset: 0 };
      const result = await controller.findMany(query as any, mockUser);

      expect(referralsService.findMany).toHaveBeenCalledWith(query, mockUser);
      expect(result.data).toHaveLength(1);
    });
  });

  describe('getDashboardMetrics', () => {
    it('should delegate to referralsService.getDashboardMetrics', async () => {
      const mockMetrics = {
        totalActive: 5,
        byStage: {} as any,
        byStatus: {} as any,
        overdue: 0,
        dueToday: 0,
      };
      referralsService.getDashboardMetrics.mockResolvedValue(mockMetrics);

      const result = await controller.getDashboardMetrics(mockUser);

      expect(referralsService.getDashboardMetrics).toHaveBeenCalledWith(mockUser);
      expect(result).toEqual(mockMetrics);
    });
  });

  describe('findOne', () => {
    it('should delegate to referralsService.findOne', async () => {
      referralsService.findOne.mockResolvedValue(mockReferral as any);

      const result = await controller.findOne(mockReferral.id, mockUser);

      expect(referralsService.findOne).toHaveBeenCalledWith(
        mockReferral.id,
        mockUser,
      );
      expect(result).toEqual(mockReferral);
    });
  });

  describe('update', () => {
    it('should delegate to referralsService.update', async () => {
      referralsService.update.mockResolvedValue({
        ...mockReferral,
        version: 2,
      } as any);

      const dto = { version: 1, referralSource: 'New Source' };
      const result = await controller.update(mockReferral.id, dto, mockUser);

      expect(referralsService.update).toHaveBeenCalledWith(
        mockReferral.id,
        dto,
        mockUser,
      );
      expect(result.version).toBe(2);
    });
  });

  describe('executeTransition', () => {
    it('should delegate to workflowService.executeTransition and use header idempotency key', async () => {
      const mockResult = {
        success: true as const,
        referral: mockReferral as any,
        transition: { id: 'trans-1' } as any,
      };
      workflowService.executeTransition.mockResolvedValue(mockResult);

      const dto = {
        targetStage: PipelineStage.CLINICAL_REVIEW,
        version: 1,
      };

      const result = await controller.executeTransition(
        mockReferral.id,
        dto,
        'header-idemp-key',
        mockUser,
      );

      expect(workflowService.executeTransition).toHaveBeenCalledWith(
        mockReferral.id,
        expect.objectContaining({
          targetStage: PipelineStage.CLINICAL_REVIEW,
          version: 1,
          idempotencyKey: 'header-idemp-key',
        }),
        mockUser,
      );
      expect(result).toEqual(mockResult);
    });
  });

  describe('updateWorkStatus', () => {
    it('should delegate to workflowService.updateWorkStatus', async () => {
      workflowService.updateWorkStatus.mockResolvedValue({
        ...mockReferral,
        workStatus: WorkStatus.IN_PROGRESS,
      } as any);

      const dto = { workStatus: WorkStatus.IN_PROGRESS, version: 1 };
      const result = await controller.updateWorkStatus(
        mockReferral.id,
        dto,
        mockUser,
      );

      expect(workflowService.updateWorkStatus).toHaveBeenCalledWith(
        mockReferral.id,
        dto,
        mockUser,
      );
      expect(result.workStatus).toBe(WorkStatus.IN_PROGRESS);
    });
  });

  describe('assignReferral', () => {
    it('should delegate to workflowService.assignReferral', async () => {
      workflowService.assignReferral.mockResolvedValue(mockReferral as any);

      const dto = { userId: 'np-1', reason: 'Assigned for initial review' };
      const result = await controller.assignReferral(
        mockReferral.id,
        dto,
        mockUser,
      );

      expect(workflowService.assignReferral).toHaveBeenCalledWith(
        mockReferral.id,
        dto,
        mockUser,
      );
      expect(result).toEqual(mockReferral);
    });
  });

  describe('getWorkflowHistory', () => {
    it('should delegate to workflowService.getWorkflowHistory with parsed pagination', async () => {
      workflowService.getWorkflowHistory.mockResolvedValue([]);

      await controller.getWorkflowHistory(
        mockReferral.id,
        '10',
        '20',
        mockUser,
      );

      expect(workflowService.getWorkflowHistory).toHaveBeenCalledWith(
        mockReferral.id,
        mockUser,
        { limit: 10, offset: 20 },
      );
    });
  });
});

describe('WorkflowExceptionFilter', () => {
  let filter: WorkflowExceptionFilter;
  let mockResponse: any;
  let mockHost: any;

  beforeEach(() => {
    filter = new WorkflowExceptionFilter();
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    mockHost = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
      }),
    };
  });

  it('should format VersionConflictException as 409 Conflict', () => {
    const error = new VersionConflictException(1, 2, { id: 'ref-1' } as any);

    filter.catch(error, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        data: expect.objectContaining({
          currentVersion: 2,
          requestedVersion: 1,
        }),
      }),
    );
  });

  it('should format WorkflowValidationException as 400 Bad Request', () => {
    const error = new WorkflowValidationException([
      { type: 'gate' as any, message: 'Missing documentation' },
    ]);

    filter.catch(error, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        errors: expect.arrayContaining([
          expect.objectContaining({ message: 'Missing documentation' }),
        ]),
      }),
    );
  });

  it('should format ForbiddenException as 403 Forbidden', () => {
    const error = new ForbiddenException('User lacks permission');

    filter.catch(error, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: 'User lacks permission',
      }),
    );
  });

  it('should format unhandled errors as 500 Internal Server Error', () => {
    const error = new Error('Database connection failed');

    filter.catch(error, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: 'An unexpected internal error occurred while processing workflow',
      }),
    );
  });
});
