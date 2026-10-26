import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { Prisma, Referral } from '@prisma/client';
import { PipelineStage, UserRole } from '@heals/types';
import { STAGE_OWNERS } from '../constants/workflow.constants';

/**
 * AssignmentService manages work allocation and routing for referrals.
 * 
 * Responsibilities:
 * - Determine appropriate assigned role and user on stage transitions (determineAssignment)
 * - Assign referral to a specific authorized user (assignToUser)
 * - Assign referral to a role queue (assignToRoleQueue)
 * - Handle return-to-originator routing (e.g., note correction to original NP)
 * - Maintain immutable assignment history in ReferralAssignment table
 * 
 * Requirements: 9.1-9.9
 */
@Injectable()
export class AssignmentService {
  private readonly logger = new Logger(AssignmentService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Determines the appropriate role and optional user assignment on stage transition.
   * 
   * Uses STAGE_OWNERS configuration to determine the primary role for the stage.
   * Handles return-to-originator scenarios (e.g. note correction returns to original NP).
   * 
   * @param referral - The referral transitioning to a new stage
   * @param newStage - The target pipeline stage
   * @param metadata - Optional metadata (e.g., originalNpId, targetUserId)
   * @returns Object with role and optional userId
   */
  async determineAssignment(
    referral: Referral,
    newStage: PipelineStage,
    metadata?: Record<string, any>,
  ): Promise<{ role: UserRole; userId?: string }> {
    this.logger.debug(
      `Determining assignment for referral ${referral.id} entering stage ${newStage}`,
    );

    const allowedRoles = STAGE_OWNERS[newStage];
    if (!allowedRoles || allowedRoles.length === 0) {
      throw new Error(`No stage owner configured for stage: ${newStage}`);
    }

    const primaryRole = allowedRoles[0];

    // Check explicit user assignment via metadata
    if (metadata?.targetUserId) {
      return { role: primaryRole, userId: metadata.targetUserId };
    }

    // NP_VISIT assignment routing:
    // 1. Explicit metadata (targetUserId, npId, originalNpId)
    // 2. Appointment scheduled nurse practitioner (Requirement 4.3, 9.2)
    // 3. Return-to-originator: previous encounter provider (Requirement 5.7, 9.8)
    if (newStage === PipelineStage.NP_VISIT) {
      if (metadata?.originalNpId) {
        return { role: primaryRole, userId: metadata.originalNpId };
      }
      if (metadata?.npId) {
        return { role: primaryRole, userId: metadata.npId };
      }

      // Check appointment assigned nurse practitioner
      const appointment = await this.prisma.appointment.findFirst({
        where: { referralId: referral.id },
        orderBy: { createdAt: 'desc' },
      });
      if (appointment?.nursePractitionerId) {
        return { role: primaryRole, userId: appointment.nursePractitionerId };
      }

      // Query the latest encounter or note to find the original NP
      const latestEncounter = await this.prisma.encounter.findFirst({
        where: { referralId: referral.id },
        orderBy: { createdAt: 'desc' },
      });

      if (latestEncounter?.nursePractitionerId || latestEncounter?.providerId) {
        return {
          role: primaryRole,
          userId: latestEncounter.nursePractitionerId || latestEncounter.providerId,
        };
      }
    }

    // Return to INTAKE: if original creator/intake specialist is known
    if (newStage === PipelineStage.INTAKE && metadata?.originalIntakeUserId) {
      return { role: primaryRole, userId: metadata.originalIntakeUserId };
    }

    // Default to role queue (unassigned to specific user)
    return { role: primaryRole };
  }

  /**
   * Assigns a referral to a specific user.
   * 
   * Validates:
   * 1. User exists and isActive is true
   * 2. User has required role
   * 3. User has matching scope access for referral's site, state, and legal entity
   * 
   * Then:
   * 1. Closes previous active ReferralAssignment (sets unassignedAt)
   * 2. Creates new ReferralAssignment record
   * 3. Updates Referral assignedTo and assignedRole
   * 
   * @param referralId - ID of referral to assign
   * @param userId - ID of user to assign to
   * @param reason - Reason for assignment/reassignment
   * @param assignedBy - ID of user making the assignment
   * @param tx - Optional transaction client
   */
  async assignToUser(
    referralId: string,
    userId: string,
    reason: string,
    assignedBy?: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    this.logger.debug(
      `Assigning referral ${referralId} to user ${userId} (assignedBy: ${assignedBy || 'system'})`,
    );

    const client = tx || this.prisma;

    // 1. Fetch user with roles and scopes
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        userRoles: true,
        userScopes: true,
      },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    if (!user.isActive) {
      throw new BadRequestException(`Cannot assign to inactive user ${userId}`);
    }

    // 2. Fetch referral to check scope matching
    const referral = await client.referral.findUnique({
      where: { id: referralId },
    });

    if (!referral) {
      throw new NotFoundException(`Referral with ID ${referralId} not found`);
    }

    // 3. Verify user has matching scope access (unless ADMIN)
    const isAdmin = user.userRoles.some((r) => r.role === 'ADMIN');
    if (!isAdmin) {
      if (referral.site) {
        const hasSite = user.userScopes.some(
          (s) => s.site === null || s.site === referral.site,
        );
        if (!hasSite) {
          throw new BadRequestException(
            `User ${userId} lacks scope for site ${referral.site}`,
          );
        }
      }

      if (referral.state) {
        const hasState = user.userScopes.some(
          (s) => s.state === null || s.state === referral.state,
        );
        if (!hasState) {
          throw new BadRequestException(
            `User ${userId} lacks scope for state ${referral.state}`,
          );
        }
      }

      if (referral.legalEntity) {
        const hasEntity = user.userScopes.some(
          (s) => s.legalEntity === null || s.legalEntity === referral.legalEntity,
        );
        if (!hasEntity) {
          throw new BadRequestException(
            `User ${userId} lacks scope for legal entity ${referral.legalEntity}`,
          );
        }
      }
    }

    // 4. Select appropriate role from user's roles
    const targetStage = referral.pipelineStage as unknown as PipelineStage;
    const stageAllowedRoles = STAGE_OWNERS[targetStage] || [];
    const matchedRoleAssignment = user.userRoles.find((r) =>
      stageAllowedRoles.includes(r.role as unknown as UserRole),
    );

    const assignedRole = (matchedRoleAssignment?.role ||
      user.userRoles[0]?.role ||
      UserRole.INTAKE_SPECIALIST) as unknown as any;

    // 5. Close previous active assignment
    await client.referralAssignment.updateMany({
      where: {
        referralId,
        unassignedAt: null,
      },
      data: {
        unassignedAt: new Date(),
        reason: reason || 'Reassigned',
      },
    });

    // 6. Create new ReferralAssignment record
    await client.referralAssignment.create({
      data: {
        referralId,
        userId,
        role: assignedRole,
        assignedAt: new Date(),
        assignedBy: assignedBy || null,
        reason: reason || 'Assigned to user',
      },
    });

    // 7. Update Referral assignedTo and assignedRole
    await client.referral.update({
      where: { id: referralId },
      data: {
        assignedTo: userId,
        assignedRole,
      },
    });
  }

  /**
   * Assigns a referral to a role queue (clears assignedTo).
   * 
   * 1. Closes previous active ReferralAssignment (sets unassignedAt)
   * 2. Sets Referral assignedRole to the target role
   * 3. Clears Referral assignedTo (sets to null)
   * 
   * @param referralId - ID of referral to assign
   * @param role - Target role queue
   * @param reason - Reason for queue assignment
   * @param assignedBy - ID of user making the assignment
   * @param tx - Optional transaction client
   */
  async assignToRoleQueue(
    referralId: string,
    role: UserRole,
    reason: string,
    assignedBy?: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    this.logger.debug(
      `Assigning referral ${referralId} to role queue ${role}`,
    );

    const client = tx || this.prisma;

    // 1. Close previous active assignment
    await client.referralAssignment.updateMany({
      where: {
        referralId,
        unassignedAt: null,
      },
      data: {
        unassignedAt: new Date(),
        reason: reason || 'Reassigned to role queue',
      },
    });

    // 2. Update Referral assignedRole and clear assignedTo
    await client.referral.update({
      where: { id: referralId },
      data: {
        assignedTo: null,
        assignedRole: role as unknown as any,
      },
    });
  }
}
