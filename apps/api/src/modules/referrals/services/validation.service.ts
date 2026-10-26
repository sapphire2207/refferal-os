import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { RedisService } from '../../../redis/redis.service';
import { PipelineStage, AuthTokenPayload } from '@heals/types';
import { Referral } from '@prisma/client';
import { ROLE_PERMISSIONS } from '../constants/permissions.constants';
import { ALLOWED_TRANSITIONS } from '../constants/workflow.constants';

/**
 * ValidationService
 * 
 * Handles all validation logic for workflow transitions including:
 * - User authorization (action permissions)
 * - Scope access verification (site, state, legal entity)
 * - Transition path validation (allowed stage transitions)
 * - Version validation (optimistic concurrency control)
 * 
 * This service implements the authorization and transition validation
 * components of Property 1 (Authorization Enforcement) and Property 2
 * (Transition Validation).
 * 
 * @see Design: Authorization Model
 * @see Requirements: 1.1, 1.2, 1.3, 1.7, 14.1-14.9
 */
@Injectable()
export class ValidationService {
  private readonly logger = new Logger(ValidationService.name);
  
  // Cache TTL for permission lookups (5 minutes)
  private readonly PERMISSION_CACHE_TTL = 300;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Checks if a user has the required action permission for a specific transition.
   * 
   * Implements permission-based authorization where permissions are tied to actions
   * (e.g., referrals.transition.to_billing) rather than destination stage ownership.
   * 
   * Uses Redis caching for permission lookups with 5-minute TTL to reduce
   * repeated database queries for the same user.
   * 
   * ADMIN role bypasses all permission checks.
   * 
   * @param user - The authenticated user's token payload with roles and scopes
   * @param action - The action permission string to check (e.g., 'referrals.transition.to_clinical_review')
   * @param referral - The referral being operated on (for context)
   * @returns Promise<boolean> - true if user has permission, false otherwise
   * 
   * @see Requirement 1.1: Authorization check for transition action permission
   * @see Requirement 14.2: Verify user has required action permission
   * @see Requirement 14.9: Validate current permissions on each request
   * @see Design: Authorization Flow
   */
  async checkAuthorization(
    user: AuthTokenPayload,
    action: string,
    referral: Referral,
  ): Promise<boolean> {
    this.logger.debug(`Checking authorization for user ${user.userId}, action: ${action}`);
    
    // 1. Check if user is ADMIN (bypass all permission checks)
    if (user.roles.includes('ADMIN')) {
      this.logger.debug(`User ${user.userId} has ADMIN role, bypassing permission check`);
      return true;
    }

    // 2. Check Redis cache for permission
    const cacheKey = `user:permissions:${user.userId}`;
    try {
      const cachedPermissions = await this.redis.getJson<string[]>(cacheKey);
      
      if (cachedPermissions) {
        this.logger.debug(`Cache hit for user ${user.userId} permissions`);
        return cachedPermissions.includes(action);
      }
    } catch (error) {
      this.logger.warn(`Redis cache read failed: ${error.message}`);
      // Continue with non-cached path
    }

    // 3. Compute permissions from ROLE_PERMISSIONS mapping
    const userPermissions = new Set<string>();
    
    for (const role of user.roles) {
      const rolePermissions = ROLE_PERMISSIONS[role];
      if (rolePermissions) {
        rolePermissions.forEach(permission => userPermissions.add(permission));
      } else {
        this.logger.warn(`No permission mapping found for role: ${role}`);
      }
    }

    const permissionsArray = Array.from(userPermissions);
    
    // 4. Cache result in Redis with PERMISSION_CACHE_TTL
    try {
      await this.redis.setJson(cacheKey, permissionsArray, this.PERMISSION_CACHE_TTL);
      this.logger.debug(`Cached permissions for user ${user.userId}`);
    } catch (error) {
      this.logger.warn(`Redis cache write failed: ${error.message}`);
      // Continue without caching
    }

    // 5. Return boolean indicating permission grant
    const hasPermission = permissionsArray.includes(action);
    
    this.logger.debug(
      `Authorization result for user ${user.userId}, action ${action}: ${hasPermission}`
    );
    
    return hasPermission;
  }

  /**
   * Validates that the user's scope (sites, states, legal entities) matches
   * the referral's location attributes.
   * 
   * Scope-based authorization ensures users can only operate on referrals
   * within their organizational boundaries. This is critical for multi-site
   * and multi-state healthcare operations.
   * 
   * ADMIN role bypasses all scope checks.
   * 
   * @param user - The authenticated user's token payload with scopes
   * @param referral - The referral being operated on
   * @returns Promise<boolean> - true if user has scope access, false otherwise
   * 
   * @see Requirement 1.2: Scope access verification for referral's location attributes
   * @see Requirement 14.3: Verify user's site scope includes referral's site
   * @see Requirement 14.4: Verify user's state scope includes referral's state
   * @see Requirement 14.5: Verify user's legal entity scope includes referral's legal entity
   * @see Design: Scope Validation Logic
   */
  async checkScope(
    user: AuthTokenPayload,
    referral: Referral,
  ): Promise<boolean> {
    this.logger.debug(`Checking scope for user ${user.userId}, referral ${referral.id}`);
    
    // 1. Check if user is ADMIN (bypass all scope checks)
    if (user.roles.includes('ADMIN')) {
      this.logger.debug(`User ${user.userId} is ADMIN, bypassing scope checks`);
      return true;
    }
    
    // 2. Check if referral.site is in user.scopes.sites (if site is set)
    if (referral.site) {
      if (!user.scopes.sites.includes(referral.site)) {
        this.logger.warn(
          `User ${user.userId} lacks site scope access. Required: ${referral.site}, Has: [${user.scopes.sites.join(', ')}]`
        );
        return false;
      }
      this.logger.debug(`Site scope validated: ${referral.site}`);
    }
    
    // 3. Check if referral.state is in user.scopes.states (if state is set)
    if (referral.state) {
      if (!user.scopes.states.includes(referral.state)) {
        this.logger.warn(
          `User ${user.userId} lacks state scope access. Required: ${referral.state}, Has: [${user.scopes.states.join(', ')}]`
        );
        return false;
      }
      this.logger.debug(`State scope validated: ${referral.state}`);
    }
    
    // 4. Check if referral.legalEntity is in user.scopes.legalEntities (if legalEntity is set)
    if (referral.legalEntity) {
      if (!user.scopes.legalEntities.includes(referral.legalEntity)) {
        this.logger.warn(
          `User ${user.userId} lacks legal entity scope access. Required: ${referral.legalEntity}, Has: [${user.scopes.legalEntities.join(', ')}]`
        );
        return false;
      }
      this.logger.debug(`Legal entity scope validated: ${referral.legalEntity}`);
    }
    
    // 5. Return true only if all applicable scopes match
    this.logger.debug(`All scope checks passed for user ${user.userId}, referral ${referral.id}`);
    return true;
  }

  /**
   * Validates that the requested stage transition is allowed based on the
   * current pipeline stage and the ALLOWED_TRANSITIONS configuration.
   * 
   * The workflow supports both forward progression (toward BILLING) and
   * backward correction flows. This method enforces the allowed paths
   * defined in the state machine.
   * 
   * @param fromStage - The current pipeline stage
   * @param toStage - The requested target pipeline stage
   * @returns boolean - true if transition is allowed, false otherwise
   * 
   * @see Requirement 1.3: Forward transition validation against ALLOWED_TRANSITIONS
   * @see Design: Stage Transition Matrix
   * @see constants/workflow.constants.ts: ALLOWED_TRANSITIONS
   */
  validateTransitionPath(
    fromStage: PipelineStage,
    toStage: PipelineStage,
  ): boolean {
    this.logger.debug(`Validating transition path: ${fromStage} -> ${toStage}`);
    
    // Look up allowed transitions for the current stage
    const allowedTransitions = ALLOWED_TRANSITIONS[fromStage];
    
    // Check if the requested target stage is in the allowed transitions array
    const isAllowed = allowedTransitions.includes(toStage);
    
    if (!isAllowed) {
      this.logger.warn(
        `Invalid transition path: ${fromStage} -> ${toStage}. ` +
        `Allowed transitions: [${allowedTransitions.join(', ')}]`
      );
    }
    
    return isAllowed;
  }

  /**
   * Validates that the requested version matches the current referral version
   * for optimistic concurrency control.
   * 
   * Version-based concurrency prevents lost updates when multiple users attempt
   * simultaneous transitions. The version field is incremented on each state
   * change, and mismatches trigger conflict detection.
   * 
   * @param referral - The current referral entity with current version
   * @param requestedVersion - The version from the client's transition request
   * @returns ValidationResult with version conflict error if mismatch detected
   * 
   * @see Requirement 1.7: Version mismatch handling with 409 status
   * @see Requirement 8.1: Validate provided version matches current database version
   * @see Requirement 8.2: Reject request with 409 Conflict on version mismatch
   * @see Design: Version-Based Concurrency Control Flow
   */
  validateVersion(
    referral: Referral,
    requestedVersion: number,
  ): ValidationResult {
    this.logger.debug(
      `Validating version: requested=${requestedVersion}, current=${referral.version}`
    );
    
    // Compare requested version with current referral version
    if (requestedVersion !== referral.version) {
      // Version mismatch detected - return validation error
      return {
        valid: false,
        errors: [
          {
            type: 'version',
            field: 'version',
            message: 'Version conflict detected. The referral has been modified by another user.',
            details: {
              requestedVersion,
              currentVersion: referral.version,
              referralId: referral.id,
            },
          },
        ],
      };
    }
    
    // Version matches - validation successful
    return {
      valid: true,
      errors: [],
    };
  }
}

/**
 * ValidationResult interface
 * 
 * Represents the outcome of a validation check with detailed error information.
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * ValidationError interface
 * 
 * Provides structured error information for validation failures including:
 * - type: The category of validation error
 * - field: The specific field that failed validation (if applicable)
 * - message: Human-readable error message
 * - details: Additional context for the error
 */
export interface ValidationError {
  type: 'permission' | 'scope' | 'gate' | 'transition' | 'version';
  field?: string;
  message: string;
  details?: Record<string, any>;
}
