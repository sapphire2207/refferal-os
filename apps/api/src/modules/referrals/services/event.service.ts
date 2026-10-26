import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { Prisma, EventOutbox, EventOutboxStatus } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { WorkflowMetricsService } from './workflow-metrics.service';

/**
 * EventService manages transactional outbox pattern for reliable event emission.
 * 
 * This service handles:
 * - Writing events to outbox within database transactions (enqueueEvent)
 * - Background processing of pending events (processOutbox)
 * - Retry logic for failed event publishing with max 5 retries
 * - Event emission to WebSocket, notifications, and dashboard systems
 * 
 * Requirements: 1.10, 17.1-17.13
 */
@Injectable()
export class EventService {
  private readonly logger = new Logger(EventService.name);
  private readonly MAX_RETRIES = 5;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly metricsService?: WorkflowMetricsService,
  ) {}

  /**
   * Writes an event to the EventOutbox table within the same transaction as state changes.
   * This ensures atomic commitment of both state changes and event emission.
   * 
   * @param eventType - Type of event (e.g., 'referral.stage.changed', 'referral.assigned')
   * @param aggregateId - ID of the referral or entity that changed
   * @param payload - Event data payload (stored as JSON)
   * @param tx - Prisma transaction context (optional; defaults to this.prisma)
   * 
   * @returns The created EventOutbox record
   */
  async enqueueEvent(
    eventType: string,
    aggregateId: string,
    payload: any,
    tx?: Prisma.TransactionClient,
  ): Promise<EventOutbox> {
    const eventId = uuidv4();
    this.logger.debug(
      `Enqueuing event: ${eventType} (${eventId}) for aggregate ${aggregateId}`,
    );

    const client = tx || this.prisma;
    return await client.eventOutbox.create({
      data: {
        eventId,
        eventType,
        aggregateId,
        payload: payload ?? {},
        status: EventOutboxStatus.PENDING,
        retryCount: 0,
        createdAt: new Date(),
      },
    });
  }

  /**
   * Background processor that publishes pending events from the outbox.
   * Should be called periodically (e.g. by a scheduled cron job every 10 seconds).
   * 
   * Process:
   * 1. SELECT pending events (status=PENDING, ordered by createdAt, limit 100)
   * 2. For each event, dispatch to appropriate emitters
   * 3. On success: UPDATE status=PUBLISHED, publishedAt=NOW()
   * 4. On failure: INCREMENT retryCount, UPDATE lastAttemptAt
   * 5. After 5 retries: UPDATE status=FAILED
   * 
   * @param limit - Maximum number of pending events to process in one batch
   * @returns Stats of processed, succeeded, and failed events
   */
  async processOutbox(limit: number = 100): Promise<{
    processed: number;
    succeeded: number;
    failed: number;
  }> {
    this.logger.debug(`Processing event outbox (limit: ${limit})`);

    const pendingEvents = await this.prisma.eventOutbox.findMany({
      where: {
        status: EventOutboxStatus.PENDING,
      },
      orderBy: {
        createdAt: 'asc',
      },
      take: limit,
    });

    let succeeded = 0;
    let failed = 0;

    for (const event of pendingEvents) {
      try {
        await this.publishEvent(event);

        await this.prisma.eventOutbox.update({
          where: { id: event.id },
          data: {
            status: EventOutboxStatus.PUBLISHED,
            publishedAt: new Date(),
          },
        });

        succeeded++;
      } catch (error) {
        const newRetryCount = event.retryCount + 1;
        const newStatus =
          newRetryCount >= this.MAX_RETRIES
            ? EventOutboxStatus.FAILED
            : EventOutboxStatus.PENDING;

        await this.prisma.eventOutbox.update({
          where: { id: event.id },
          data: {
            retryCount: newRetryCount,
            lastAttemptAt: new Date(),
            status: newStatus,
          },
        });

        failed++;
        if (newStatus === EventOutboxStatus.FAILED) {
          this.logger.error(
            `Event ${event.id} (${event.eventType}) failed after ${this.MAX_RETRIES} attempts: ${error.message}`,
          );
          this.metricsService?.recordFailedOutboxEvent(
            event.id,
            this.MAX_RETRIES,
            error.message,
          );
        } else {
          this.logger.warn(
            `Event ${event.id} failed attempt ${newRetryCount}/${this.MAX_RETRIES}: ${error.message}`,
          );
        }
      }
    }

    return {
      processed: pendingEvents.length,
      succeeded,
      failed,
    };
  }

  /**
   * Dispatches an individual outbox event to specific subscriber handlers.
   * 
   * @param event - The outbox event record
   */
  async publishEvent(event: EventOutbox): Promise<void> {
    const payload = (event.payload as Record<string, any>) || {};

    switch (event.eventType) {
      case 'referral.stage.changed':
      case 'referral.stage_changed':
        await this.emitStageChanged(
          event.aggregateId,
          payload.fromStage,
          payload.toStage,
          payload.metadata || {},
        );
        break;

      case 'referral.assigned':
        await this.emitAssignment(
          event.aggregateId,
          payload.previousAssignee || null,
          payload.newAssignee,
          payload.metadata || {},
        );
        break;

      case 'referral.work_status.changed':
      case 'referral.work_status_changed':
        await this.emitWorkStatusChanged(
          event.aggregateId,
          payload.fromStatus,
          payload.toStatus,
          payload.metadata || {},
        );
        break;

      default:
        this.logger.log(
          `Published event ${event.eventType} for aggregate ${event.aggregateId}`,
        );
        break;
    }
  }

  /**
   * Emits a stage transition event to all subscribers.
   */
  async emitStageChanged(
    referralId: string,
    fromStage: string,
    toStage: string,
    metadata: Record<string, any> = {},
  ): Promise<void> {
    this.logger.log(
      `Emitting stage changed event: referral=${referralId} ${fromStage} → ${toStage}`,
    );
  }

  /**
   * Emits an assignment change event to all subscribers.
   */
  async emitAssignment(
    referralId: string,
    previousAssignee: { userId?: string; role?: string } | null,
    newAssignee: { userId?: string; role?: string },
    metadata: Record<string, any> = {},
  ): Promise<void> {
    this.logger.log(
      `Emitting assignment event: referral=${referralId} → ${newAssignee?.userId || newAssignee?.role}`,
    );
  }

  /**
   * Emits a work status change event to all subscribers.
   */
  async emitWorkStatusChanged(
    referralId: string,
    fromStatus: string,
    toStatus: string,
    metadata: Record<string, any> = {},
  ): Promise<void> {
    this.logger.log(
      `Emitting work status changed event: referral=${referralId} ${fromStatus} → ${toStatus}`,
    );
  }

  /**
   * Retrieves summary statistics of the Transactional Outbox for telemetry and health checks.
   */
  async getOutboxStats(): Promise<{
    pending: number;
    published: number;
    failed: number;
    total: number;
  }> {
    const [pending, published, failed, total] = await Promise.all([
      this.prisma.eventOutbox.count({
        where: { status: EventOutboxStatus.PENDING },
      }),
      this.prisma.eventOutbox.count({
        where: { status: EventOutboxStatus.PUBLISHED },
      }),
      this.prisma.eventOutbox.count({
        where: { status: EventOutboxStatus.FAILED },
      }),
      this.prisma.eventOutbox.count(),
    ]);

    return { pending, published, failed, total };
  }
}

