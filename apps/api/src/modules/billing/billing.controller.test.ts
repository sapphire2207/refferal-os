import { Test, TestingModule } from '@nestjs/testing';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { UserRole, AuthTokenPayload, BillingStatus } from '@heals/types';

describe('BillingController', () => {
  let controller: BillingController;
  let service: any;

  const mockBiller: AuthTokenPayload = {
    userId: 'biller-1',
    email: 'biller@heals.com',
    roles: [UserRole.BILLING_COORDINATOR],
    scopes: { sites: [], states: [], legalEntities: [] },
    sessionId: 'sess-bill',
    iat: 1,
    exp: 999999,
  };

  beforeEach(async () => {
    service = {
      validateBillingReadiness: jest.fn().mockResolvedValue({ isReady: true, blockers: [] }),
      createClaim: jest.fn().mockResolvedValue({ id: 'claim-1' }),
      findAllClaims: jest.fn().mockResolvedValue({ data: [], total: 0 }),
      findClaimById: jest.fn().mockResolvedValue({ id: 'claim-1' }),
      submitClaim: jest.fn().mockResolvedValue({ id: 'claim-1', status: BillingStatus.SUBMITTED }),
      adjudicateClaim: jest.fn().mockResolvedValue({ claim: { id: 'claim-1', status: BillingStatus.PAID } }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BillingController],
      providers: [
        { provide: BillingService, useValue: service },
      ],
    }).compile();

    controller = module.get<BillingController>(BillingController);
  });

  describe('validateReadiness', () => {
    it('should validate billing readiness', async () => {
      const res = await controller.validateReadiness('ref-1', mockBiller);
      expect(service.validateBillingReadiness).toHaveBeenCalledWith('ref-1', mockBiller);
      expect(res.isReady).toBe(true);
    });
  });

  describe('createClaim', () => {
    it('should create claim', async () => {
      const res = await controller.createClaim({ referralId: 'ref-1' }, mockBiller);
      expect(service.createClaim).toHaveBeenCalledWith({ referralId: 'ref-1' }, mockBiller);
      expect(res.id).toBe('claim-1');
    });
  });

  describe('findAllClaims', () => {
    it('should query claims', async () => {
      const res = await controller.findAllClaims({ page: 1, limit: 10 }, mockBiller);
      expect(service.findAllClaims).toHaveBeenCalledWith({ page: 1, limit: 10 }, mockBiller);
      expect(res.data).toEqual([]);
    });
  });

  describe('findClaimById', () => {
    it('should retrieve claim by ID', async () => {
      const res = await controller.findClaimById('claim-1', mockBiller);
      expect(service.findClaimById).toHaveBeenCalledWith('claim-1', mockBiller);
      expect(res.id).toBe('claim-1');
    });
  });

  describe('submitClaim', () => {
    it('should submit claim', async () => {
      const res = await controller.submitClaim('claim-1', {}, mockBiller);
      expect(service.submitClaim).toHaveBeenCalledWith('claim-1', {}, mockBiller);
      expect(res.status).toBe(BillingStatus.SUBMITTED);
    });
  });

  describe('adjudicateClaim', () => {
    it('should record claim adjudication', async () => {
      const dto = { status: BillingStatus.PAID, paidAmount: 200.0 };
      const res = await controller.adjudicateClaim('claim-1', dto, mockBiller);
      expect(service.adjudicateClaim).toHaveBeenCalledWith('claim-1', dto, mockBiller);
      expect(res.claim.status).toBe(BillingStatus.PAID);
    });
  });
});
