import { Controller, Get, Optional } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { PrismaService } from './database/prisma.service';
import { RedisService } from './redis/redis.service';
import { EventService } from './modules/referrals/services/event.service';
import { WorkflowMetricsService } from './modules/referrals/services/workflow-metrics.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    @Optional() private readonly eventService?: EventService,
    @Optional() private readonly metricsService?: WorkflowMetricsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'System health check, database, redis, outbox status and metrics' })
  @ApiResponse({ status: 200, description: 'System health status and telemetry snapshot' })
  async check() {
    const dbStatus = await this.checkDatabase();
    const redisStatus = await this.checkRedis();
    
    let outboxStats: any = null;
    if (this.eventService) {
      try {
        outboxStats = await this.eventService.getOutboxStats();
      } catch {
        outboxStats = { status: 'unavailable' };
      }
    }

    const workflowMetrics = this.metricsService?.getMetrics();
    const isHealthy = dbStatus && redisStatus && (!outboxStats || outboxStats.failed === 0);

    return {
      status: isHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      services: {
        database: dbStatus ? 'up' : 'down',
        redis: redisStatus ? 'up' : 'down',
        outbox: outboxStats,
      },
      workflowMetrics,
    };
  }

  private async checkDatabase(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  private async checkRedis(): Promise<boolean> {
    try {
      await this.redis.ping();
      return true;
    } catch {
      return false;
    }
  }
}

