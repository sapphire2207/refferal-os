import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';

export interface RateLimitPolicy {
  limit: number;
  windowSeconds: number;
  failClosed?: boolean;
}

export const RATE_LIMIT_POLICIES: Record<string, RateLimitPolicy> = {
  'auth-login': { limit: 5, windowSeconds: 900, failClosed: true }, // 5 attempts per 15 min
  'auth-mfa': { limit: 5, windowSeconds: 900, failClosed: true }, // 5 attempts per 15 min
  'auth-reset': { limit: 3, windowSeconds: 3600, failClosed: true }, // 3 attempts per hour
  'auth-refresh': { limit: 30, windowSeconds: 300 }, // 30 per 5 min
  'api-search': { limit: 60, windowSeconds: 60 }, // 60 per min
  'api-upload': { limit: 15, windowSeconds: 60 }, // 15 per min
  'api-global': { limit: 120, windowSeconds: 60 }, // 120 per min
};

/**
 * DistributedRateLimiterService
 * 
 * Provides distributed Redis-backed rate limiting with sliding expiration.
 * Enforces abuse protection across multiple backend API instances.
 * 
 * Requirements: Section 4 - Abuse Protection & Rate Limiting
 */
@Injectable()
export class DistributedRateLimiterService {
  private readonly logger = new Logger(DistributedRateLimiterService.name);
  // In-memory fallback if Redis is temporarily unreachable
  private readonly memoryFallback = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly redis: RedisService) {}

  /**
   * Enforces rate limit for an action identifier (e.g. IP, email, userId).
   * Throws HttpException(429) if limit exceeded.
   */
  async enforce(
    tier: keyof typeof RATE_LIMIT_POLICIES | string,
    identifier: string,
    customPolicy?: RateLimitPolicy,
  ): Promise<void> {
    const policy = customPolicy || RATE_LIMIT_POLICIES[tier] || RATE_LIMIT_POLICIES['api-global'];
    const key = `ratelimit:${tier}:${identifier}`;

    let current = 0;
    let ttl = policy.windowSeconds;

    try {
      const client = (this.redis as any).client;
      if (client && client.isOpen) {
        // Atomic increment and TTL
        current = await client.incr(key);
        if (current === 1) {
          await client.expire(key, policy.windowSeconds);
        } else {
          const remainingTtl = await client.ttl(key);
          if (remainingTtl > 0) {
            ttl = remainingTtl;
          }
        }
      } else {
        current = this.handleMemoryFallback(key, policy);
      }
    } catch (error: any) {
      this.logger.error(`Redis rate limiting failed for ${key}: ${error.message}`);
      if (policy.failClosed) {
        throw new HttpException(
          {
            statusCode: HttpStatus.SERVICE_UNAVAILABLE,
            message: 'Authentication service temporarily unavailable. Please retry shortly.',
            error: 'Service Unavailable',
          },
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      current = this.handleMemoryFallback(key, policy);
    }

    if (current > policy.limit) {
      this.logger.warn(`Rate limit exceeded for [${tier}] key=${identifier}. Attempts: ${current}/${policy.limit}`);
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: `Too many requests. Please try again in ${ttl} seconds.`,
          retryAfter: ttl,
          error: 'Too Many Requests',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /**
   * Resets the rate limit counter for an identifier (e.g., upon successful login).
   */
  async reset(tier: string, identifier: string): Promise<void> {
    const key = `ratelimit:${tier}:${identifier}`;
    try {
      await this.redis.del(key);
    } catch (e: any) {
      this.logger.warn(`Failed to reset rate limit for ${key}: ${e.message}`);
    }
    this.memoryFallback.delete(key);
  }

  private handleMemoryFallback(key: string, policy: RateLimitPolicy): number {
    const now = Date.now();
    const existing = this.memoryFallback.get(key);

    if (!existing || existing.resetAt <= now) {
      this.memoryFallback.set(key, { count: 1, resetAt: now + policy.windowSeconds * 1000 });
      return 1;
    }

    existing.count += 1;
    return existing.count;
  }
}
