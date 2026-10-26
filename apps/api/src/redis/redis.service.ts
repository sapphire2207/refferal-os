import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, RedisClientType } from 'redis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: RedisClientType;
  private pubClient: RedisClientType;
  private subClient: RedisClientType;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const host = this.configService.get('REDIS_HOST', 'localhost');
    const port = this.configService.get('REDIS_PORT', 6379);
    const password = this.configService.get('REDIS_PASSWORD');

    const redisConfig = {
      socket: {
        host,
        port: parseInt(port.toString()),
      },
      ...(password && { password }),
    };

    // Main client for general operations
    this.client = createClient(redisConfig);
    await this.client.connect();

    // Pub/Sub clients
    this.pubClient = createClient(redisConfig);
    this.subClient = createClient(redisConfig);
    
    await this.pubClient.connect();
    await this.subClient.connect();

    this.logger.log('✅ Redis connected successfully');
  }

  async onModuleDestroy() {
    await this.client.quit();
    await this.pubClient.quit();
    await this.subClient.quit();
    this.logger.log('Redis disconnected');
  }

  // Cache operations
  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    if (ttl) {
      await this.client.setEx(key, ttl, value);
    } else {
      await this.client.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async delPattern(pattern: string): Promise<void> {
    try {
      const keys = await this.client.keys(pattern);
      if (keys && keys.length > 0) {
        await this.client.del(keys);
      }
    } catch (e) {
      this.logger.warn(`Failed to delete pattern ${pattern}: ${e.message}`);
    }
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.client.exists(key);
    return result === 1;
  }

  async ping(): Promise<string> {
    return this.client.ping();
  }

  // JSON operations
  async getJson<T>(key: string): Promise<T | null> {
    const data = await this.get(key);
    return data ? JSON.parse(data) : null;
  }

  async setJson<T>(key: string, value: T, ttl?: number): Promise<void> {
    await this.set(key, JSON.stringify(value), ttl);
  }

  // Pub/Sub operations
  async publish(channel: string, message: any): Promise<void> {
    const payload = typeof message === 'string' ? message : JSON.stringify(message);
    await this.pubClient.publish(channel, payload);
  }

  async subscribe(channel: string, callback: (message: string) => void): Promise<void> {
    await this.subClient.subscribe(channel, callback);
  }

  async unsubscribe(channel: string): Promise<void> {
    await this.subClient.unsubscribe(channel);
  }

  // Pattern-based subscription
  async pSubscribe(pattern: string, callback: (message: string, channel: string) => void): Promise<void> {
    await this.subClient.pSubscribe(pattern, callback);
  }

  // List operations
  async lpush(key: string, value: string): Promise<number> {
    return this.client.lPush(key, value);
  }

  async rpush(key: string, value: string): Promise<number> {
    return this.client.rPush(key, value);
  }

  async lpop(key: string): Promise<string | null> {
    return this.client.lPop(key);
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    return this.client.lRange(key, start, stop);
  }

  // Hash operations
  async hset(key: string, field: string, value: string): Promise<number> {
    return this.client.hSet(key, field, value);
  }

  async hget(key: string, field: string): Promise<string | undefined> {
    return this.client.hGet(key, field);
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    return this.client.hGetAll(key);
  }

  async hdel(key: string, field: string): Promise<number> {
    return this.client.hDel(key, field);
  }

  // Set operations
  async sadd(key: string, member: string): Promise<number> {
    return this.client.sAdd(key, member);
  }

  async smembers(key: string): Promise<string[]> {
    return this.client.sMembers(key);
  }

  async sismember(key: string, member: string): Promise<boolean> {
    return this.client.sIsMember(key, member);
  }

  // Sorted set operations
  async zadd(key: string, score: number, member: string): Promise<number> {
    return this.client.zAdd(key, { score, value: member });
  }

  async zrange(key: string, start: number, stop: number): Promise<string[]> {
    return this.client.zRange(key, start, stop);
  }

  // Increment/Decrement
  async incr(key: string): Promise<number> {
    return this.client.incr(key);
  }

  async decr(key: string): Promise<number> {
    return this.client.decr(key);
  }

  async incrby(key: string, increment: number): Promise<number> {
    return this.client.incrBy(key, increment);
  }

  // TTL operations
  async ttl(key: string): Promise<number> {
    return this.client.ttl(key);
  }

  async expire(key: string, seconds: number): Promise<boolean> {
    return this.client.expire(key, seconds);
  }
}
