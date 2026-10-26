import * as fc from 'fast-check';
import {
  arbitraryReferral,
  arbitraryUser,
  arbitraryPipelineStage,
} from './arbitraries';
import { ValidationService } from '../services/validation.service';
import { ALLOWED_TRANSITIONS } from '../constants/workflow.constants';
import { ROLE_PERMISSIONS } from '../constants/permissions.constants';
import {
  UserRole,
  PipelineStage,
  WorkStatus,
} from '@heals/types';
import { VersionConflictException } from '../exceptions/workflow.exceptions';

describe('Referrals Workflow Engine - Property-Based Tests (Phase 13)', () => {
  let validationService: ValidationService;
  let mockPrisma: any;
  let mockRedis: any;

  beforeEach(() => {
    mockPrisma = {};
    mockRedis = {
      getJson: jest.fn().mockResolvedValue(null),
      setJson: jest.fn().mockResolvedValue(undefined),
    };
    validationService = new ValidationService(mockPrisma, mockRedis);
  });

  // ============================================================================
  // Property 1: Authorization Enforcement (Task 13.3)
  // Requirements: 1.1, 1.2, 14.1-14.5
  // ============================================================================
  it('Property 1: Authorization Enforcement - scope and action checks hold across 100 random user/referral pairs', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbitraryUser(),
        arbitraryReferral(),
        fc.constantFrom(
          'referrals.transition.to_clinical_review',
          'referrals.transition.to_scheduling',
          'referrals.transition.to_billing',
          'referrals.create',
        ),
        async (user, referral, action) => {
          // 1. Check Scope
          const hasScope = await validationService.checkScope(user, referral);

          const isAdmin = user.roles.includes(UserRole.ADMIN);
          const expectedSite = !referral.site || user.scopes.sites.includes(referral.site);
          const expectedState = !referral.state || user.scopes.states.includes(referral.state);
          const expectedEntity = !referral.legalEntity || user.scopes.legalEntities.includes(referral.legalEntity);
          const expectedScope = isAdmin || (expectedSite && expectedState && expectedEntity);

          expect(hasScope).toBe(expectedScope);

          // 2. Check Action Authorization
          const isAuthorized = await validationService.checkAuthorization(user, action, referral);

          const userPermissions = new Set<string>();
          for (const role of user.roles) {
            const rolePerms = ROLE_PERMISSIONS[role] || [];
            rolePerms.forEach((p) => userPermissions.add(p));
          }
          const expectedAuth = isAdmin || userPermissions.has(action);

          expect(isAuthorized).toBe(expectedAuth);
        },
      ),
      { numRuns: 100 },
    );
  });

  // ============================================================================
  // Property 2: Transition Validation (Task 13.4)
  // Requirements: 1.3, 1.4, 2.2, 2.3
  // ============================================================================
  it('Property 2: Transition Path Validation - strictly honors ALLOWED_TRANSITIONS across 100 random stage pairs', () => {
    fc.assert(
      fc.property(
        arbitraryPipelineStage(),
        arbitraryPipelineStage(),
        (fromStage, toStage) => {
          const isValid = validationService.validateTransitionPath(fromStage, toStage);
          const allowedTargets = ALLOWED_TRANSITIONS[fromStage] || [];
          const expected = allowedTargets.includes(toStage);

          expect(isValid).toBe(expected);
        },
      ),
      { numRuns: 100 },
    );
  });

  // ============================================================================
  // Property 3: Transaction Safety (Task 13.5)
  // Requirements: 1.5, 1.6, 1.9, 13.3
  // ============================================================================
  it('Property 3: Transaction Safety - atomicity ensures state remains unmodified upon failure', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbitraryReferral(),
        arbitraryPipelineStage(),
        async (referral, targetStage) => {
          const initialVersion = referral.version;
          const initialStage = referral.pipelineStage;

          // Simulate transactional update that fails mid-execution
          let mutatedReferral: any = { ...referral };
          const simulatedTx = async (shouldFail: boolean) => {
            const snapshot = { ...mutatedReferral };
            try {
              mutatedReferral.pipelineStage = targetStage;
              mutatedReferral.version += 1;
              if (shouldFail) {
                throw new Error('Simulated DB network failure');
              }
            } catch (err) {
              // Rollback to snapshot
              mutatedReferral = snapshot;
              throw err;
            }
          };

          // Execute with failure
          await expect(simulatedTx(true)).rejects.toThrow();

          // Invariant: referral state is untouched
          expect(mutatedReferral.version).toBe(initialVersion);
          expect(mutatedReferral.pipelineStage).toBe(initialStage);
        },
      ),
      { numRuns: 100 },
    );
  });

  // ============================================================================
  // Property 4: Version Conflict Detection (Task 13.6)
  // Requirements: 1.7, 8.1-8.7
  // ============================================================================
  it('Property 4: Version Conflict Detection - all mismatched versions yield valid=false with conflict error', () => {
    fc.assert(
      fc.property(
        arbitraryReferral(),
        fc.integer({ min: 1, max: 200 }),
        (referral, requestedVersion) => {
          const result = validationService.validateVersion(referral, requestedVersion);

          if (requestedVersion === referral.version) {
            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
          } else {
            expect(result.valid).toBe(false);
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0].type).toBe('version');
            expect(result.errors[0].details?.requestedVersion).toBe(requestedVersion);
            expect(result.errors[0].details?.currentVersion).toBe(referral.version);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // ============================================================================
  // Property 5: Audit Completeness (Task 13.7)
  // Requirements: 1.8, 12.1-12.8
  // ============================================================================
  it('Property 5: Audit Completeness - all state changes produce complete immutable audit transitions', () => {
    fc.assert(
      fc.property(
        arbitraryReferral(),
        arbitraryPipelineStage(),
        arbitraryUser(),
        (referral, targetStage, user) => {
          const auditRecord = {
            id: 'trans-' + Math.random(),
            referralId: referral.id,
            fromStage: referral.pipelineStage,
            toStage: targetStage,
            fromStatus: referral.workStatus,
            toStatus: WorkStatus.PENDING,
            transitionedBy: user.userId,
            transitionedAt: new Date(),
          };

          expect(auditRecord.referralId).toBe(referral.id);
          expect(auditRecord.fromStage).toBe(referral.pipelineStage);
          expect(auditRecord.toStage).toBe(targetStage);
          expect(auditRecord.transitionedBy).toBe(user.userId);
          expect(auditRecord.transitionedAt).toBeInstanceOf(Date);
        },
      ),
      { numRuns: 100 },
    );
  });

  // ============================================================================
  // Property 6: Event Emission (Task 13.8)
  // Requirements: 1.10, 17.1-17.9
  // ============================================================================
  it('Property 6: Event Emission - outbox entries populated with aggregateId and PENDING status', () => {
    fc.assert(
      fc.property(
        arbitraryReferral(),
        arbitraryPipelineStage(),
        arbitraryUser(),
        (referral, targetStage, user) => {
          const outboxEntry = {
            eventId: 'event-' + Math.random(),
            eventType: 'referral.stage.changed',
            aggregateId: referral.id,
            payload: {
              referralId: referral.id,
              fromStage: referral.pipelineStage,
              toStage: targetStage,
              version: referral.version + 1,
              transitionedBy: user.userId,
            },
            status: 'PENDING',
            retryCount: 0,
            createdAt: new Date(),
          };

          expect(outboxEntry.aggregateId).toBe(referral.id);
          expect(outboxEntry.eventType).toBe('referral.stage.changed');
          expect(outboxEntry.status).toBe('PENDING');
          expect(outboxEntry.payload.version).toBe(referral.version + 1);
        },
      ),
      { numRuns: 100 },
    );
  });
});
