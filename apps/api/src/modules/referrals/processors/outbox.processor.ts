import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EventService } from '../services/event.service';

/**
 * OutboxProcessor
 * 
 * Scheduled background processor that regularly polls and publishes pending events
 * from the Transactional Outbox (EventOutbox table) every 10 seconds.
 * 
 * Implements exponential backoff retries and terminal failure dead-lettering.
 * 
 * @see Requirement 17.7-17.13
 * @see Design: Transactional Outbox Pattern
 */
@Injectable()
export class OutboxProcessor {
  private readonly logger = new Logger(OutboxProcessor.name);
  private isProcessing = false;

  constructor(private readonly eventService: EventService) {}

  /**
   * Scheduled cron job running every 10 seconds.
   * Uses lock flag to prevent overlapping executions if a batch takes longer than 10s.
   */
  @Cron('*/10 * * * * *')
  async handleOutboxProcessing(): Promise<void> {
    if (this.isProcessing) {
      this.logger.debug('Previous outbox processing run still in progress, skipping tick');
      return;
    }

    this.isProcessing = true;
    try {
      const result = await this.eventService.processOutbox(50);
      if (result.processed > 0) {
        this.logger.log(
          `Outbox batch processed: ${result.processed} events (${result.succeeded} succeeded, ${result.failed} failed)`,
        );
      }
    } catch (error: any) {
      this.logger.error(`Error processing outbox events: ${error.message}`, error.stack);
    } finally {
      this.isProcessing = false;
    }
  }
}
