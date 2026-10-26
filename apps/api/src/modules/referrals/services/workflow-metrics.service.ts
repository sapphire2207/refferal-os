import { Injectable, Logger } from '@nestjs/common';

export interface LatencyStats {
  count: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  p95Ms: number;
}

export interface WorkflowEngineMetrics {
  totalTransitions: number;
  latency: LatencyStats;
  versionConflictsTotal: number;
  versionConflictsRecent: number;
  conflictRateAlert: boolean;
  failedOutboxEventsTotal: number;
  recentTransitions: Array<{
    fromStage: string;
    toStage: string;
    latencyMs: number;
    timestamp: string;
  }>;
}

/**
 * WorkflowMetricsService
 * 
 * Provides telemetry, latency measurement, version conflict rate alerting,
 * and outbox dead-letter event monitoring for the Referrals Workflow Engine.
 * 
 * Requirements: 16.1, 16.2, 17.4
 */
@Injectable()
export class WorkflowMetricsService {
  private readonly logger = new Logger(WorkflowMetricsService.name);

  // Latency samples (capped at last 500 samples)
  private readonly latencies: number[] = [];
  private readonly MAX_SAMPLES = 500;

  // Recent transitions log
  private readonly recentTransitions: Array<{
    fromStage: string;
    toStage: string;
    latencyMs: number;
    timestamp: string;
  }> = [];

  // Version conflict tracking timestamps (ms)
  private readonly versionConflictTimestamps: number[] = [];
  private totalVersionConflicts = 0;
  private readonly CONFLICT_RATE_THRESHOLD_PER_MINUTE = 10;

  // Failed outbox events count
  private totalFailedOutboxEvents = 0;

  /**
   * Records a completed state transition with its execution latency.
   * Logs a warning if latency exceeds the 500ms SLA target.
   */
  recordTransition(fromStage: string, toStage: string, latencyMs: number): void {
    this.latencies.push(latencyMs);
    if (this.latencies.length > this.MAX_SAMPLES) {
      this.latencies.shift();
    }

    this.recentTransitions.push({
      fromStage,
      toStage,
      latencyMs,
      timestamp: new Date().toISOString(),
    });
    if (this.recentTransitions.length > 50) {
      this.recentTransitions.shift();
    }

    if (latencyMs > 500) {
      this.logger.warn(
        `[SLA BREACH] Transition ${fromStage} → ${toStage} exceeded 500ms target: ${latencyMs}ms`,
      );
    } else {
      this.logger.debug(
        `Transition ${fromStage} → ${toStage} completed in ${latencyMs}ms`,
      );
    }
  }

  /**
   * Records an optimistic concurrency version conflict and alerts if rate spikes.
   */
  recordVersionConflict(referralId: string, expectedVersion: number, actualVersion: number): void {
    const now = Date.now();
    this.totalVersionConflicts++;
    this.versionConflictTimestamps.push(now);

    // Prune timestamps older than 60 seconds
    const oneMinuteAgo = now - 60000;
    while (
      this.versionConflictTimestamps.length > 0 &&
      this.versionConflictTimestamps[0] < oneMinuteAgo
    ) {
      this.versionConflictTimestamps.shift();
    }

    const recentCount = this.versionConflictTimestamps.length;
    this.logger.warn(
      `Version conflict on referral ${referralId}: expected ${expectedVersion}, actual ${actualVersion} (Recent: ${recentCount}/min)`,
    );

    if (recentCount >= this.CONFLICT_RATE_THRESHOLD_PER_MINUTE) {
      this.logger.error(
        `[ALERT] High version conflict rate: ${recentCount} conflicts in last 60 seconds! Potential concurrent hotspot.`,
      );
    }
  }

  /**
   * Records a terminal failure for an outbox event that exceeded maximum retry attempts.
   */
  recordFailedOutboxEvent(eventId: string, attempts: number, error: string): void {
    this.totalFailedOutboxEvents++;
    this.logger.error(
      `[ALERT] Dead-letter outbox event: event ${eventId} reached maximum ${attempts} retries. Error: ${error}`,
    );
  }

  /**
   * Calculates rolling latency percentiles and statistics.
   */
  getLatencyStats(): LatencyStats {
    if (this.latencies.length === 0) {
      return { count: 0, avgMs: 0, minMs: 0, maxMs: 0, p95Ms: 0 };
    }

    const sorted = [...this.latencies].sort((a, b) => a - b);
    const sum = sorted.reduce((acc, val) => acc + val, 0);
    const avgMs = Math.round((sum / sorted.length) * 10) / 10;
    const minMs = sorted[0];
    const maxMs = sorted[sorted.length - 1];

    const p95Index = Math.min(
      Math.floor(sorted.length * 0.95),
      sorted.length - 1,
    );
    const p95Ms = sorted[p95Index];

    return {
      count: this.latencies.length,
      avgMs,
      minMs,
      maxMs,
      p95Ms,
    };
  }

  /**
   * Returns a snapshot of workflow engine performance and health metrics.
   */
  getMetrics(): WorkflowEngineMetrics {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    const recentConflicts = this.versionConflictTimestamps.filter(
      (ts) => ts >= oneMinuteAgo,
    ).length;

    return {
      totalTransitions: this.latencies.length,
      latency: this.getLatencyStats(),
      versionConflictsTotal: this.totalVersionConflicts,
      versionConflictsRecent: recentConflicts,
      conflictRateAlert: recentConflicts >= this.CONFLICT_RATE_THRESHOLD_PER_MINUTE,
      failedOutboxEventsTotal: this.totalFailedOutboxEvents,
      recentTransitions: [...this.recentTransitions],
    };
  }
}
