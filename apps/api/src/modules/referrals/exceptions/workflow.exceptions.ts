import { BadRequestException, ConflictException, HttpStatus } from '@nestjs/common';
import { ValidationErrorDto } from '../dto/transition-response.dto';
import { Referral } from '@prisma/client';

/**
 * Thrown when workflow transition or gate validation fails.
 * Carries structured ValidationErrorDto[] for field-level feedback.
 */
export class WorkflowValidationException extends BadRequestException {
  public readonly errors: ValidationErrorDto[];

  constructor(errors: ValidationErrorDto[], message = 'Validation failed for workflow transition') {
    super({
      statusCode: HttpStatus.BAD_REQUEST,
      success: false,
      message,
      errors,
    });
    this.errors = errors;
  }
}

/**
 * Thrown when optimistic concurrency conflict is detected.
 * Returns HTTP 409 Conflict with the current database referral state.
 */
export class VersionConflictException extends ConflictException {
  public readonly currentVersion: number;
  public readonly requestedVersion: number;
  public readonly currentReferral?: Referral;
  public readonly errors: ValidationErrorDto[];

  constructor(
    requestedVersion: number,
    currentVersion: number,
    currentReferral?: Referral,
  ) {
    const errorDetails: ValidationErrorDto = {
      type: 'version' as any,
      field: 'version',
      message: `Version conflict: requested version ${requestedVersion} does not match current version ${currentVersion}`,
      details: {
        requestedVersion,
        currentVersion,
        referralId: currentReferral?.id,
      },
    };

    super({
      statusCode: HttpStatus.CONFLICT,
      success: false,
      message: `Version conflict: referral has been updated (current version: ${currentVersion})`,
      currentVersion,
      requestedVersion,
      currentReferral,
      errors: [errorDetails],
    });

    this.requestedVersion = requestedVersion;
    this.currentVersion = currentVersion;
    this.currentReferral = currentReferral;
    this.errors = [errorDetails];
  }
}
