import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import {
  WorkflowValidationException,
  VersionConflictException,
} from '../exceptions/workflow.exceptions';
import { ErrorResponseDto, ValidationErrorType } from '../dto/transition-response.dto';

/**
 * WorkflowExceptionFilter handles domain-specific and standard HTTP exceptions
 * for referrals workflow endpoints, formatting responses strictly according to
 * ErrorResponseDto.
 * 
 * Maps:
 * - WorkflowValidationException -> 400 Bad Request with field-level errors
 * - VersionConflictException -> 409 Conflict with current version and state
 * - ForbiddenException -> 403 Forbidden with permission/scope context
 * - NotFoundException -> 404 Not Found
 * - General HttpException -> respective HTTP status
 * - Uncaught error -> 500 Internal Server Error (safe message)
 * 
 * Requirements: 13.1 - 13.9
 */
@Catch()
export class WorkflowExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(WorkflowExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    // 1. Version Conflict (409)
    if (exception instanceof VersionConflictException) {
      this.logger.warn(`Version conflict: ${exception.message}`);
      const status = HttpStatus.CONFLICT;
      const errorResponse = {
        success: false as const,
        message: exception.message,
        errors: exception.errors,
        data: {
          currentVersion: exception.currentVersion,
          requestedVersion: exception.requestedVersion,
          currentState: exception.currentReferral as any,
        },
      };
      return response.status(status).json(errorResponse);
    }

    // 2. Workflow Validation Exception (400)
    if (exception instanceof WorkflowValidationException) {
      this.logger.warn(`Workflow validation failure: ${exception.message}`);
      const status = HttpStatus.BAD_REQUEST;
      const errorResponse: ErrorResponseDto = {
        success: false,
        message: exception.message,
        errors: exception.errors,
      };
      return response.status(status).json(errorResponse);
    }

    // 3. NestJS standard HttpException (e.g. ForbiddenException, NotFoundException, BadRequestException)
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();
      const message =
        typeof res === 'string'
          ? res
          : (res as any).message || exception.message;

      let errors: any[] | undefined = (res as any).errors;
      if (!errors && Array.isArray((res as any).message)) {
        // class-validator pipe validation error array
        errors = (res as any).message.map((msg: string) => ({
          type: ValidationErrorType.GATE,
          message: msg,
        }));
      }

      const errorResponse: ErrorResponseDto = {
        success: false,
        message: Array.isArray(message) ? 'Validation failed' : message,
        errors,
      };

      return response.status(status).json(errorResponse);
    }

    // 4. Uncaught / Database errors (500)
    this.logger.error('Unhandled workflow exception', (exception as Error)?.stack);
    const status = HttpStatus.INTERNAL_SERVER_ERROR;
    const errorResponse: ErrorResponseDto = {
      success: false,
      message: 'An unexpected internal error occurred while processing workflow',
    };

    return response.status(status).json(errorResponse);
  }
}
