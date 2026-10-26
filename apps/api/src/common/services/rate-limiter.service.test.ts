import { HttpException, HttpStatus } from '@nestjs/common';
import { DistributedRateLimiterService } from './rate-limiter.service';

describe('DistributedRateLimiterService', () => {
  let service: DistributedRateLimiterService;
  let mockRedisClient: any;
  let mockRedisService: any;

  beforeEach(() => {
    mockRedisClient = {
      isOpen: true,
      incr: jest.fn(),
      expire: jest.fn(),
      ttl: jest.fn(),
    };

    mockRedisService = {
      client: mockRedisClient,
      del: jest.fn(),
    };

    service = new DistributedRateLimiterService(mockRedisService);
  });

  it('should allow requests within limit', async () => {
    mockRedisClient.incr.mockResolvedValue(1);
    mockRedisClient.expire.mockResolvedValue(true);

    await expect(service.enforce('auth-login', 'ip-1.2.3.4')).resolves.toBeUndefined();
    expect(mockRedisClient.incr).toHaveBeenCalledWith('ratelimit:auth-login:ip-1.2.3.4');
    expect(mockRedisClient.expire).toHaveBeenCalledWith('ratelimit:auth-login:ip-1.2.3.4', 900);
  });

  it('should throw 429 Too Many Requests when limit is exceeded', async () => {
    mockRedisClient.incr.mockResolvedValue(6); // policy limit is 5
    mockRedisClient.ttl.mockResolvedValue(450);

    await expect(service.enforce('auth-login', 'ip-1.2.3.4')).rejects.toThrow(HttpException);

    try {
      await service.enforce('auth-login', 'ip-1.2.3.4');
    } catch (e: any) {
      expect(e.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect(e.getResponse().retryAfter).toBe(450);
    }
  });

  it('should reset rate limit key on successful auth', async () => {
    await service.reset('auth-login', 'ip-1.2.3.4');
    expect(mockRedisService.del).toHaveBeenCalledWith('ratelimit:auth-login:ip-1.2.3.4');
  });

  it('should fallback to in-memory limiter when Redis client is down', async () => {
    mockRedisClient.isOpen = false;

    // First 5 attempts succeed
    for (let i = 0; i < 5; i++) {
      await expect(service.enforce('auth-login', 'fallback-user')).resolves.toBeUndefined();
    }

    // 6th attempt throws 429
    await expect(service.enforce('auth-login', 'fallback-user')).rejects.toThrow(HttpException);
  });
});
