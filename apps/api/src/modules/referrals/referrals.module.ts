import { Module } from '@nestjs/common';
import { ValidationService } from './services/validation.service';

/**
 * ReferralsModule
 * 
 * Core module for referral workflow management including:
 * - Workflow state transitions
 * - Authorization and validation
 * - Assignment management
 * - Audit trail tracking
 * 
 * Note: DatabaseModule and RedisModule are @Global() so they don't need
 * to be imported explicitly - their providers are available everywhere.
 */
@Module({
  imports: [],
  controllers: [],
  providers: [ValidationService],
  exports: [ValidationService],
})
export class ReferralsModule {}
