import { PrismaClient, UserRole, PipelineStage, WorkStatus, CaseOutcome, BillingStatus, Priority } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...\n');

  // Hash password (using same as in production for consistency)
  const passwordHash = await bcrypt.hash('Admin@2024!', 12);

  // ============================================================================
  // Create Users with Different Roles
  // ============================================================================

  console.log('Creating users...');

  const admin = await prisma.user.upsert({
    where: { email: 'admin@heals.health' },
    update: {},
    create: {
      email: 'admin@heals.health',
      passwordHash,
      firstName: 'System',
      lastName: 'Administrator',
      isActive: true,
    },
  });

  const intake1 = await prisma.user.upsert({
    where: { email: 'intake@heals.health' },
    update: {},
    create: {
      email: 'intake@heals.health',
      passwordHash,
      firstName: 'Sarah',
      lastName: 'Johnson',
      isActive: true,
    },
  });

  const reviewer1 = await prisma.user.upsert({
    where: { email: 'reviewer@heals.health' },
    update: {},
    create: {
      email: 'reviewer@heals.health',
      passwordHash,
      firstName: 'Dr. Michael',
      lastName: 'Chen',
      isActive: true,
    },
  });

  const scheduler1 = await prisma.user.upsert({
    where: { email: 'scheduler@heals.health' },
    update: {},
    create: {
      email: 'scheduler@heals.health',
      passwordHash,
      firstName: 'Emily',
      lastName: 'Rodriguez',
      isActive: true,
    },
  });

  const np1 = await prisma.user.upsert({
    where: { email: 'np@heals.health' },
    update: {},
    create: {
      email: 'np@heals.health',
      passwordHash,
      firstName: 'NP Jessica',
      lastName: 'Williams',
      isActive: true,
    },
  });

  const billing1 = await prisma.user.upsert({
    where: { email: 'billing@heals.health' },
    update: {},
    create: {
      email: 'billing@heals.health',
      passwordHash,
      firstName: 'David',
      lastName: 'Martinez',
      isActive: true,
    },
  });

  console.log('✅ Users created\n');

  // ============================================================================
  // Assign Roles
  // ============================================================================

  console.log('Assigning roles...');

  await prisma.userRole.createMany({
    data: [
      { userId: admin.id, role: UserRole.ADMIN },
      { userId: intake1.id, role: UserRole.INTAKE_SPECIALIST },
      { userId: reviewer1.id, role: UserRole.CLINICAL_REVIEWER },
      { userId: scheduler1.id, role: UserRole.SCHEDULER },
      { userId: np1.id, role: UserRole.NURSE_PRACTITIONER },
      { userId: billing1.id, role: UserRole.BILLING_COORDINATOR },
    ],
    skipDuplicates: true,
  });

  console.log('✅ Roles assigned\n');

  // ============================================================================
  // Assign Scopes
  // ============================================================================

  console.log('Assigning scopes...');

  await prisma.userScope.createMany({
    data: [
      { userId: intake1.id, site: 'main', state: 'CA', legalEntity: 'heals_main' },
      { userId: reviewer1.id, site: 'main', state: 'CA', legalEntity: 'heals_main' },
      { userId: scheduler1.id, site: 'main', state: 'CA', legalEntity: 'heals_main' },
      { userId: np1.id, site: 'main', state: 'CA', legalEntity: 'heals_main' },
      { userId: billing1.id, site: 'main', state: 'CA', legalEntity: 'heals_main' },
    ],
    skipDuplicates: true,
  });

  console.log('✅ Scopes assigned\n');

  // ============================================================================
  // Create Sample Patients
  // ============================================================================

  console.log('Creating patients...');

  const patient1 = await prisma.patient.create({
    data: {
      firstName: 'John',
      lastName: 'Doe',
      dateOfBirth: new Date('1980-01-15'),
      medicalRecordNumber: 'MRN001234',
      phone: '555-0100',
      email: 'john.doe@example.com',
      addressLine1: '123 Main St',
      city: 'Los Angeles',
      state: 'CA',
      zipCode: '90001',
    },
  });

  const patient2 = await prisma.patient.create({
    data: {
      firstName: 'Jane',
      lastName: 'Smith',
      dateOfBirth: new Date('1975-05-20'),
      medicalRecordNumber: 'MRN001235',
      phone: '555-0101',
      email: 'jane.smith@example.com',
      addressLine1: '456 Oak Ave',
      city: 'San Francisco',
      state: 'CA',
      zipCode: '94102',
    },
  });

  const patient3 = await prisma.patient.create({
    data: {
      firstName: 'Robert',
      lastName: 'Johnson',
      dateOfBirth: new Date('1965-11-30'),
      medicalRecordNumber: 'MRN001236',
      phone: '555-0102',
      city: 'San Diego',
      state: 'CA',
      zipCode: '92101',
    },
  });

  console.log('✅ Patients created\n');

  // ============================================================================
  // Create Sample Referrals in Different Stages
  // ============================================================================

  console.log('Creating referrals...');

  // Referral 1: In Intake
  const referral1 = await prisma.referral.create({
    data: {
      patientId: patient1.id,
      pipelineStage: PipelineStage.INTAKE,
      workStatus: WorkStatus.IN_PROGRESS,
      caseOutcome: CaseOutcome.ACTIVE,
      billingStatus: BillingStatus.NOT_READY,
      priority: Priority.ROUTINE,
      referralSource: 'City General Hospital',
      referringProvider: 'Dr. Sarah Adams',
      referringProviderNpi: '1234567890',
      referringFacility: 'City General Hospital - ER',
      insurancePayer: 'Blue Cross Blue Shield',
      insuranceMemberId: 'BC123456789',
      insuranceGroupNumber: 'GRP001',
      coverageVerified: false,
      site: 'main',
      state: 'CA',
      legalEntity: 'heals_main',
      assignedTo: intake1.id,
      assignedRole: UserRole.INTAKE_SPECIALIST,
    },
  });

  // Referral 2: In Clinical Review
  const referral2 = await prisma.referral.create({
    data: {
      patientId: patient2.id,
      pipelineStage: PipelineStage.CLINICAL_REVIEW,
      workStatus: WorkStatus.PENDING,
      caseOutcome: CaseOutcome.ACTIVE,
      billingStatus: BillingStatus.NOT_READY,
      priority: Priority.URGENT,
      referralSource: 'Community Clinic',
      referringProvider: 'Dr. Michael Brown',
      referringProviderNpi: '9876543210',
      insurancePayer: 'Medicare',
      insuranceMemberId: 'MC987654321',
      coverageVerified: true,
      coverageVerificationDate: new Date(),
      site: 'main',
      state: 'CA',
      legalEntity: 'heals_main',
      assignedTo: reviewer1.id,
      assignedRole: UserRole.CLINICAL_REVIEWER,
    },
  });

  // Referral 3: In Scheduling
  const referral3 = await prisma.referral.create({
    data: {
      patientId: patient3.id,
      pipelineStage: PipelineStage.SCHEDULING,
      workStatus: WorkStatus.PENDING,
      caseOutcome: CaseOutcome.ACTIVE,
      billingStatus: BillingStatus.NOT_READY,
      priority: Priority.ROUTINE,
      referralSource: 'South Bay Medical Center',
      referringProvider: 'Dr. Lisa Wang',
      insurancePayer: 'United Healthcare',
      insuranceMemberId: 'UHC456789123',
      coverageVerified: true,
      coverageVerificationDate: new Date(),
      site: 'main',
      state: 'CA',
      legalEntity: 'heals_main',
      assignedTo: scheduler1.id,
      assignedRole: UserRole.SCHEDULER,
    },
  });

  console.log('✅ Referrals created\n');

  // ============================================================================
  // Create Workflow Transitions
  // ============================================================================

  console.log('Creating workflow history...');

  await prisma.workflowTransition.create({
    data: {
      referralId: referral2.id,
      fromStage: PipelineStage.INTAKE,
      toStage: PipelineStage.CLINICAL_REVIEW,
      fromStatus: WorkStatus.COMPLETED,
      toStatus: WorkStatus.PENDING,
      transitionedBy: intake1.id,
      reason: 'Intake completed, moving to clinical review',
    },
  });

  await prisma.workflowTransition.createMany({
    data: [
      {
        referralId: referral3.id,
        fromStage: PipelineStage.INTAKE,
        toStage: PipelineStage.CLINICAL_REVIEW,
        fromStatus: WorkStatus.COMPLETED,
        toStatus: WorkStatus.PENDING,
        transitionedBy: intake1.id,
      },
      {
        referralId: referral3.id,
        fromStage: PipelineStage.CLINICAL_REVIEW,
        toStage: PipelineStage.SCHEDULING,
        fromStatus: WorkStatus.COMPLETED,
        toStatus: WorkStatus.PENDING,
        transitionedBy: reviewer1.id,
      },
    ],
  });

  console.log('✅ Workflow history created\n');

  // ============================================================================
  // Summary
  // ============================================================================

  console.log('📊 Seed Summary:');
  console.log('─'.repeat(50));
  console.log(`Users: 6`);
  console.log(`Patients: 3`);
  console.log(`Referrals: 3`);
  console.log('─'.repeat(50));
  console.log('\n🎉 Database seeded successfully!\n');
  console.log('Test Credentials:');
  console.log('─'.repeat(50));
  console.log('Admin:        admin@heals.health');
  console.log('Intake:       intake@heals.health');
  console.log('Reviewer:     reviewer@heals.health');
  console.log('Scheduler:    scheduler@heals.health');
  console.log('NP:           np@heals.health');
  console.log('Billing:      billing@heals.health');
  console.log('\nAll passwords: Admin@2024!');
  console.log('─'.repeat(50));
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:');
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
