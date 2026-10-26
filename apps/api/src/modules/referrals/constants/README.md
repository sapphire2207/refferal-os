# Referrals Module Constants

This directory contains constant definitions for the referrals workflow engine.

## Files

### `permissions.constants.ts`

Defines the complete permission system for the workflow engine including:

- **Action Permissions**: Granular permissions for specific operations (80+ permissions)
- **Role Mappings**: Maps each UserRole to its granted permissions
- **Helper Functions**: Utilities for checking permissions at runtime

#### Permission Structure

Permissions follow hierarchical dot notation:
- `referrals.view.{stage}` - View referrals in specific stage
- `referrals.transition.to_{stage}` - Transition referral to specific stage  
- `referrals.transition.return_to_{stage}` - Return referral to previous stage
- `referrals.review.{action}` - Clinical review actions
- `notes.{action}` - Note review and approval actions
- Other domain-specific permissions

#### Role Permission Summary

| Role | Key Permissions | Description |
|------|----------------|-------------|
| INTAKE_SPECIALIST | Intake view, transition to clinical review, document upload | Handles initial referral intake |
| CLINICAL_REVIEWER | Clinical review decisions (accept/reject/return), note review | Reviews referrals for clinical appropriateness |
| CLINICAL_COORDINATOR | All clinical reviewer permissions + reassignment | Coordinates clinical workflow |
| SCHEDULER | Appointment management, transition to NP visit | Schedules appointments |
| OFFICE_MANAGER | Scheduler permissions + broader view access, reassignment | Manages scheduling operations |
| NURSE_PRACTITIONER | Encounter and clinical note management | Documents patient visits |
| BILLING_COORDINATOR | Claim submission, transition to billing | Handles billing operations |
| ADMIN | All permissions | System administration |
| COMPLIANCE | Read-only access, audit export | Compliance and audit functions |

#### Usage Examples

```typescript
import { 
  PERMISSIONS, 
  hasPermission, 
  getTransitionPermission 
} from './permissions.constants';
import { UserRole } from '@repo/types';

// Check if user has a specific permission
const canTransition = hasPermission(
  [UserRole.INTAKE_SPECIALIST], 
  PERMISSIONS.REFERRALS_TRANSITION_TO_CLINICAL_REVIEW
);
// Returns: true

// Get permission required for a stage transition
const requiredPermission = getTransitionPermission('CLINICAL_REVIEW');
// Returns: 'referrals.transition.to_clinical_review'

// Check if user has any of several permissions
const canReview = hasAnyPermission(
  [UserRole.CLINICAL_REVIEWER],
  [
    PERMISSIONS.REFERRALS_REVIEW_ACCEPT,
    PERMISSIONS.REFERRALS_REVIEW_REJECT,
  ]
);
// Returns: true
```

#### Design Principles

1. **Action-Based Authorization**: Permissions are tied to specific actions rather than destination stage ownership
2. **Least Privilege**: Each role grants only the permissions necessary for that role's responsibilities
3. **Hierarchical**: Some roles (CLINICAL_COORDINATOR) have supersets of other roles (CLINICAL_REVIEWER)
4. **Auditable**: All permission checks are explicit and traceable

#### Requirements Addressed

- **Requirement 14.2**: Stage transition verification uses action permissions
- **Requirement 14.6**: Assignment operations have dedicated permissions

### `workflow.constants.ts`

Defines workflow-related constants including:
- Allowed stage transitions
- Required fields per stage
- Stage ownership mappings
- Work status transition rules

## Testing

Unit tests are provided in `permissions.constants.test.ts` covering:
- Role permission mappings completeness
- Helper function behavior
- Permission validation logic
- Edge cases and error conditions

Run tests with:
```bash
npm test -- permissions.constants.test.ts
```

## Integration

The permission system integrates with:
- `JwtAuthGuard` - Extracts user roles from JWT token
- `RbacGuard` - Enforces role-based access control
- `ValidationService` - Validates permissions during workflow transitions
- Redis cache - Caches user permission sets (5 min TTL)

## Extending

To add new permissions:

1. Add the permission constant to `PERMISSIONS` object
2. Add the permission to appropriate role(s) in `ROLE_PERMISSIONS`
3. Update unit tests to cover the new permission
4. Document the permission in this README

To add new roles:

1. Add the role to `UserRole` enum in `@repo/types`
2. Add role mapping to `ROLE_PERMISSIONS`
3. Validate all roles are mapped using `validateRolePermissionMappings()`
4. Update documentation
