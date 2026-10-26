import { Module } from '@nestjs/common';
import { ValidationService } from './services/validation.service';
import { GatewayCheckService } from './services/gateway-check.service';
import { EventService } from './services/event.service';
import { AssignmentService } from './services/assignment.service';
import { WorkflowService } from './services/workflow.service';
import { ReferralsService } from './services/referrals.service';
import { ReferralsController } from './referrals.controller';
import { OutboxProcessor } from './processors/outbox.processor';
import { WorkflowMetricsService } from './services/workflow-metrics.service';

/**
 * ReferralsModule
 * 
 * Core module for referral workflow management including:
 * - Referral CRUD operations (ReferralsService)
 * - Workflow state transitions (WorkflowService)
 * - Stage gate checking (GatewayCheckService)
 * - Authorization and validation (ValidationService)
 * - Assignment management (AssignmentService)
 * - Event outbox publishing and scheduled background processing (EventService, OutboxProcessor)
 * - Workflow telemetry and metrics (WorkflowMetricsService)
 * - Audit trail tracking
 * 
 * Note: DatabaseModule and RedisModule are @Global() so they don't need
 * to be imported explicitly - their providers are available everywhere.
 */
@Module({
  imports: [],
  controllers: [ReferralsController],
  providers: [
    ValidationService,
    GatewayCheckService,
    EventService,
    AssignmentService,
    WorkflowService,
    ReferralsService,
    OutboxProcessor,
    WorkflowMetricsService,
  ],
  exports: [
    ValidationService,
    GatewayCheckService,
    EventService,
    AssignmentService,
    WorkflowService,
    ReferralsService,
    OutboxProcessor,
    WorkflowMetricsService,
  ],
})
export class ReferralsModule {}

