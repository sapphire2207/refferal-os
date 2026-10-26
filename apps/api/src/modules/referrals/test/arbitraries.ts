import * as fc from 'fast-check';
import {
  PipelineStage,
  WorkStatus,
  UserRole,
  CaseOutcome,
  BillingStatus,
  AuthTokenPayload,
} from '@heals/types';
import { Referral } from '@prisma/client';
import { TransitionRequestDto } from '../dto/transition-request.dto';

export const arbitraryPipelineStage = (): fc.Arbitrary<PipelineStage> =>
  fc.constantFrom(
    PipelineStage.INTAKE,
    PipelineStage.CLINICAL_REVIEW,
    PipelineStage.SCHEDULING,
    PipelineStage.NP_VISIT,
    PipelineStage.NOTES_QA,
    PipelineStage.BILLING,
  );

export const arbitraryWorkStatus = (): fc.Arbitrary<WorkStatus> =>
  fc.constantFrom(
    WorkStatus.PENDING,
    WorkStatus.IN_PROGRESS,
    WorkStatus.ON_HOLD,
    WorkStatus.BLOCKED_NEEDS_INFO,
    WorkStatus.COMPLETED,
  );

export const arbitraryUserRole = (): fc.Arbitrary<UserRole> =>
  fc.constantFrom(
    UserRole.INTAKE_SPECIALIST,
    UserRole.CLINICAL_REVIEWER,
    UserRole.CLINICAL_COORDINATOR,
    UserRole.OFFICE_MANAGER,
    UserRole.SCHEDULER,
    UserRole.NURSE_PRACTITIONER,
    UserRole.BILLING_COORDINATOR,
    UserRole.ADMIN,
    UserRole.COMPLIANCE,
  );

const SITES = ['Site-A', 'Site-B', 'Site-C'];
const STATES = ['FL', 'GA', 'TX'];
const LEGAL_ENTITIES = ['HEALS_FL', 'HEALS_GA', 'HEALS_TX'];

export const arbitraryReferral = (): fc.Arbitrary<Referral> =>
  fc.record({
    id: fc.uuid(),
    patientId: fc.uuid(),
    pipelineStage: arbitraryPipelineStage() as any,
    workStatus: arbitraryWorkStatus() as any,
    caseOutcome: fc.constant(CaseOutcome.ACTIVE) as any,
    billingStatus: fc.constant(BillingStatus.NOT_READY) as any,
    priority: fc.constantFrom('ROUTINE', 'URGENT', 'STAT') as any,
    referralSource: fc.string({ minLength: 1, maxLength: 30 }),
    referringProvider: fc.string({ minLength: 1, maxLength: 30 }),
    referringProviderNpi: fc.string({ minLength: 10, maxLength: 10 }),
    referringFacility: fc.string({ minLength: 1, maxLength: 30 }),
    insurancePayer: fc.constantFrom('Medicare', 'Medicaid', 'BlueCross', 'Aetna', 'Humana'),
    insuranceMemberId: fc.string({ minLength: 5, maxLength: 15 }),
    insuranceGroupNumber: fc.string({ minLength: 3, maxLength: 10 }),
    coverageVerified: fc.boolean(),
    coverageVerificationDate: fc.date(),
    coverageNotes: fc.string({ maxLength: 50 }),
    site: fc.constantFrom(...SITES),
    state: fc.constantFrom(...STATES),
    legalEntity: fc.constantFrom(...LEGAL_ENTITIES),
    assignedTo: fc.option(fc.uuid(), { nil: null as any }),
    assignedRole: fc.option(arbitraryUserRole(), { nil: null as any }),
    version: fc.integer({ min: 1, max: 100 }),
    createdAt: fc.date(),
    updatedAt: fc.date(),
  }) as unknown as fc.Arbitrary<Referral>;

export const arbitraryUser = (): fc.Arbitrary<AuthTokenPayload> =>
  fc.record({
    userId: fc.uuid(),
    email: fc.emailAddress(),
    sessionId: fc.uuid(),
    iat: fc.constant(1000000),
    exp: fc.constant(2000000),
    roles: fc.array(arbitraryUserRole(), { minLength: 1, maxLength: 3 }),
    scopes: fc.record({
      sites: fc.subarray(SITES),
      states: fc.subarray(STATES),
      legalEntities: fc.subarray(LEGAL_ENTITIES),
    }),
  });

export const arbitraryTransitionRequest = (
  version?: number,
): fc.Arbitrary<TransitionRequestDto> =>
  fc.record({
    targetStage: arbitraryPipelineStage(),
    reason: fc.option(fc.string({ minLength: 10, maxLength: 100 })),
    version: version !== undefined ? fc.constant(version) : fc.integer({ min: 1, max: 100 }),
    metadata: fc.option(fc.dictionary(fc.string(), fc.string())),
    idempotencyKey: fc.option(fc.uuid()),
  }) as unknown as fc.Arbitrary<TransitionRequestDto>;
