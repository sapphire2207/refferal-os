import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, RedisClientType } from 'redis';

interface MemoryCacheEntry {
  value: string;
  expiresAt?: number;
}

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: RedisClientType | null = null;
  private pubClient: RedisClientType | null = null;
  private subClient: RedisClientType | null = null;
  private isConnected = false;

  // In-memory fallback for local development when Redis daemon is not running
  private memoryCache = new Map<string, MemoryCacheEntry>();
  private memoryLists = new Map<string, string[]>();
  private memoryHashes = new Map<string, Map<string, string>>();
  private memorySets = new Map<string, Set<string>>();
  private memorySortedSets = new Map<string, Array<{ score: number; value: string }>>();
  private subscriptions = new Map<string, Array<(message: string) => void>>();

  constructor(private readonly configService: ConfigService) { }

  async onModuleInit() {
    const host = this.configService.get('REDIS_HOST', 'localhost');
    const port = this.configService.get('REDIS_PORT', 6379);
    const password = this.configService.get('REDIS_PASSWORD');

    const redisConfig = {
      socket: {
        host,
        port: parseInt(port.toString()),
        reconnectStrategy: false, // Don't infinite loop on startup if Redis is down
        connectTimeout: 2000,
      },
      ...(password && { password }),
    };

    try {
      this.client = createClient(redisConfig);
      this.client.on('error', (err) => {
        if (this.isConnected) {
          this.logger.warn(`Redis Client error: ${err.message}`);
        }
      });

      this.pubClient = createClient(redisConfig);
      this.pubClient.on('error', (err) => {
        if (this.isConnected) {
          this.logger.warn(`Redis PubClient error: ${err.message}`);
        }
      });

      this.subClient = createClient(redisConfig);
      this.subClient.on('error', (err) => {
        if (this.isConnected) {
          this.logger.warn(`Redis SubClient error: ${err.message}`);
        }
      });

      await this.client.connect();
      await this.pubClient.connect();
      await this.subClient.connect();

      this.isConnected = true;
      this.logger.log('✅ Redis connected successfully');
    } catch (err: any) {
      this.isConnected = false;
      this.logger.warn(
        `⚠️ Redis offline (${err.message || 'connection refused'}). Activated in-memory fallback for dev mode.`,
      );
    }
  }

  async onModuleDestroy() {
    if (this.isConnected && this.client) {
      try {
        await this.client.quit();
        await this.pubClient?.quit();
        await this.subClient?.quit();
        this.logger.log('Redis disconnected');
      } catch (e: any) {
        this.logger.warn(`Error during Redis disconnect: ${e.message}`);
      }
    }
  }

  // Cache operations
  async get(key: string): Promise<string | null> {
    if (this.isConnected && this.client) {
      return this.client.get(key);
    }
    const entry = this.memoryCache.get(key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.memoryCache.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    if (this.isConnected && this.client) {
      if (ttl) {
        await this.client.setEx(key, ttl, value);
      } else {
        await this.client.set(key, value);
      }
      return;
    }
    this.memoryCache.set(key, {
      value,
      expiresAt: ttl ? Date.now() + ttl * 1000 : undefined,
    });
  }

  async del(key: string): Promise<void> {
    if (this.isConnected && this.client) {
      await this.client.del(key);
      return;
    }
    this.memoryCache.delete(key);
  }

  async delPattern(pattern: string): Promise<void> {
    if (this.isConnected && this.client) {
      try {
        const keys = await this.client.keys(pattern);
        if (keys && keys.length > 0) {
          await this.client.del(keys);
        }
      } catch (e: any) {
        this.logger.warn(`Failed to delete pattern ${pattern}: ${e.message}`);
      }
      return;
    }

    const regex = new RegExp(`^${pattern.replace(/\*/g, '.*')}$`);
    for (const key of Array.from(this.memoryCache.keys())) {
      if (regex.test(key)) {
        this.memoryCache.delete(key);
      }
    }
  }

  async exists(key: string): Promise<boolean> {
    if (this.isConnected && this.client) {
      const result = await this.client.exists(key);
      return result === 1;
    }
    return (await this.get(key)) !== null;
  }

  async ping(): Promise<string> {
    if (this.isConnected && this.client) {
      return this.client.ping();
    }
    return 'PONG';
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
    if (this.isConnected && this.pubClient) {
      await this.pubClient.publish(channel, payload);
      return;
    }
    const handlers = this.subscriptions.get(channel) || [];
    for (const handler of handlers) {
      try {
        handler(payload);
      } catch (e: any) {
        this.logger.error(`Error in subscriber handler: ${e.message}`);
      }
    }
  }

  async subscribe(channel: string, callback: (message: string) => void): Promise<void> {
    if (this.isConnected && this.subClient) {
      await this.subClient.subscribe(channel, callback);
      return;
    }
    const list = this.subscriptions.get(channel) || [];
    list.push(callback);
    this.subscriptions.set(channel, list);
  }

  async unsubscribe(channel: string): Promise<void> {
    if (this.isConnected && this.subClient) {
      await this.subClient.unsubscribe(channel);
      return;
    }
    this.subscriptions.delete(channel);
  }

  async pSubscribe(pattern: string, callback: (message: string, channel: string) => void): Promise<void> {
    if (this.isConnected && this.subClient) {
      await this.subClient.pSubscribe(pattern, callback);
      return;
    }
    // Simple mock for pattern subscription in dev
    this.subscribe(pattern, (msg) => callback(msg, pattern));
  }

  // List operations
  async lpush(key: string, value: string): Promise<number> {
    if (this.isConnected && this.client) {
      return this.client.lPush(key, value);
    }
    const list = this.memoryLists.get(key) || [];
    list.unshift(value);
    this.memoryLists.set(key, list);
    return list.length;
  }

  async rpush(key: string, value: string): Promise<number> {
    if (this.isConnected && this.client) {
      return this.client.rPush(key, value);
    }
    const list = this.memoryLists.get(key) || [];
    list.push(value);
    this.memoryLists.set(key, list);
    return list.length;
  }

  async lpop(key: string): Promise<string | null> {
    if (this.isConnected && this.client) {
      return this.client.lPop(key);
    }
    const list = this.memoryLists.get(key) || [];
    const item = list.shift();
    return item ?? null;
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    if (this.isConnected && this.client) {
      return this.client.lRange(key, start, stop);
    }
    const list = this.memoryLists.get(key) || [];
    const actualStop = stop === -1 ? list.length : stop + 1;
    return list.slice(start, actualStop);
  }

  // Hash operations
  async hset(key: string, field: string, value: string): Promise<number> {
    if (this.isConnected && this.client) {
      return this.client.hSet(key, field, value);
    }
    let map = this.memoryHashes.get(key);
    if (!map) {
      map = new Map();
      this.memoryHashes.set(key, map);
    }
    const isNew = !map.has(field);
    map.set(field, value);
    return isNew ? 1 : 0;
  }

  async hget(key: string, field: string): Promise<string | undefined> {
    if (this.isConnected && this.client) {
      return this.client.hGet(key, field);
    }
    const map = this.memoryHashes.get(key);
    return map?.get(field);
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    if (this.isConnected && this.client) {
      return this.client.hGetAll(key);
    }
    const map = this.memoryHashes.get(key);
    if (!map) return {};
    const obj: Record<string, string> = {};
    for (const [k, v] of map.entries()) {
      obj[k] = v;
    }
    return obj;
  }

  async hdel(key: string, field: string): Promise<number> {
    if (this.isConnected && this.client) {
      return this.client.hDel(key, field);
    }
    const map = this.memoryHashes.get(key);
    if (map && map.delete(field)) return 1;
    return 0;
  }

  // Set operations
  async sadd(key: string, member: string): Promise<number> {
    if (this.isConnected && this.client) {
      return this.client.sAdd(key, member);
    }
    let set = this.memorySets.get(key);
    if (!set) {
      set = new Set();
      this.memorySets.set(key, set);
    }
    const isNew = !set.has(member);
    set.add(member);
    return isNew ? 1 : 0;
  }

  async smembers(key: string): Promise<string[]> {
    if (this.isConnected && this.client) {
      return this.client.sMembers(key);
    }
    const set = this.memorySets.get(key);
    return set ? Array.from(set) : [];
  }

  async sismember(key: string, member: string): Promise<boolean> {
    if (this.isConnected && this.client) {
      return this.client.sIsMember(key, member);
    }
    const set = this.memorySets.get(key);
    return set ? set.has(member) : false;
  }

  // Sorted set operations
  async zadd(key: string, score: number, member: string): Promise<number> {
    if (this.isConnected && this.client) {
      return this.client.zAdd(key, { score, value: member });
    }
    let list = this.memorySortedSets.get(key);
    if (!list) {
      list = [];
      this.memorySortedSets.set(key, list);
    }
    list = list.filter((item) => item.value !== member);
    list.push({ score, value: member });
    list.sort((a, b) => a.score - b.score);
    this.memorySortedSets.set(key, list);
    return 1;
  }

  async zrange(key: string, start: number, stop: number): Promise<string[]> {
    if (this.isConnected && this.client) {
      return this.client.zRange(key, start, stop);
    }
    const list = this.memorySortedSets.get(key) || [];
    const actualStop = stop === -1 ? list.length : stop + 1;
    return list.slice(start, actualStop).map((i) => i.value);
  }

  // Increment/Decrement
  async incr(key: string): Promise<number> {
    if (this.isConnected && this.client) {
      return this.client.incr(key);
    }
    const val = parseInt((await this.get(key)) || '0', 10) + 1;
    await this.set(key, val.toString());
    return val;
  }

  async decr(key: string): Promise<number> {
    if (this.isConnected && this.client) {
      return this.client.decr(key);
    }
    const val = parseInt((await this.get(key)) || '0', 10) - 1;
    await this.set(key, val.toString());
    return val;
  }

  async incrby(key: string, increment: number): Promise<number> {
    if (this.isConnected && this.client) {
      return this.client.incrBy(key, increment);
    }
    const val = parseInt((await this.get(key)) || '0', 10) + increment;
    await this.set(key, val.toString());
    return val;
  }

  // TTL operations
  async ttl(key: string): Promise<number> {
    if (this.isConnected && this.client) {
      return this.client.ttl(key);
    }
    const entry = this.memoryCache.get(key);
    if (!entry || !entry.expiresAt) return -1;
    const remaining = Math.max(0, Math.floor((entry.expiresAt - Date.now()) / 1000));
    return remaining;
  }

  async expire(key: string, seconds: number): Promise<boolean> {
    if (this.isConnected && this.client) {
      return this.client.expire(key, seconds);
    }
    const entry = this.memoryCache.get(key);
    if (!entry) return false;
    entry.expiresAt = Date.now() + seconds * 1000;
    return true;
  }
}
