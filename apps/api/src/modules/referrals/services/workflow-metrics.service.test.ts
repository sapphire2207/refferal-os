import { WorkflowMetricsService } from './workflow-metrics.service';

describe('WorkflowMetricsService', () => {
  let service: WorkflowMetricsService;

  beforeEach(() => {
    service = new WorkflowMetricsService();
  });

  it('should initialize with empty metrics', () => {
    const metrics = service.getMetrics();
    expect(metrics.totalTransitions).toBe(0);
    expect(metrics.latency.count).toBe(0);
    expect(metrics.latency.avgMs).toBe(0);
    expect(metrics.versionConflictsTotal).toBe(0);
    expect(metrics.conflictRateAlert).toBe(false);
    expect(metrics.failedOutboxEventsTotal).toBe(0);
  });

  it('should record transitions and calculate latency statistics accurately', () => {
    service.recordTransition('INTAKE', 'CLINICAL_REVIEW', 20);
    service.recordTransition('CLINICAL_REVIEW', 'SCHEDULING', 40);
    service.recordTransition('SCHEDULING', 'NP_VISIT', 60);

    const stats = service.getLatencyStats();
    expect(stats.count).toBe(3);
    expect(stats.avgMs).toBe(40);
    expect(stats.minMs).toBe(20);
    expect(stats.maxMs).toBe(60);
    expect(stats.p95Ms).toBe(60);

    const metrics = service.getMetrics();
    expect(metrics.totalTransitions).toBe(3);
    expect(metrics.recentTransitions).toHaveLength(3);
    expect(metrics.recentTransitions[0].fromStage).toBe('INTAKE');
    expect(metrics.recentTransitions[2].toStage).toBe('NP_VISIT');
  });

  it('should record version conflicts and trigger conflict rate alert on spike', () => {
    // Record 9 conflicts -> under threshold 10
    for (let i = 0; i < 9; i++) {
      service.recordVersionConflict('ref-1', 1, 2);
    }
    let metrics = service.getMetrics();
    expect(metrics.versionConflictsTotal).toBe(9);
    expect(metrics.versionConflictsRecent).toBe(9);
    expect(metrics.conflictRateAlert).toBe(false);

    // 10th conflict triggers conflict rate alert
    service.recordVersionConflict('ref-1', 1, 2);
    metrics = service.getMetrics();
    expect(metrics.versionConflictsTotal).toBe(10);
    expect(metrics.versionConflictsRecent).toBe(10);
    expect(metrics.conflictRateAlert).toBe(true);
  });

  it('should record failed outbox events', () => {
    service.recordFailedOutboxEvent('evt-1', 5, 'Network timeout to downstream service');
    service.recordFailedOutboxEvent('evt-2', 5, 'Invalid recipient payload');

    const metrics = service.getMetrics();
    expect(metrics.failedOutboxEventsTotal).toBe(2);
  });
});
