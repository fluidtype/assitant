import { redis } from '../../infrastructure/redis/redis.client.js';
import { redisConfig } from '../../infrastructure/redis/redis.config.js';

export interface AvailabilitySlot {
  start: string; // ISO string
  end: string; // ISO string
  capacityLeft: number;
}

export interface AvailabilityPayload {
  tenantId: string;
  date: string; // YYYY-MM-DD
  slots: AvailabilitySlot[];
  lastUpdated: string; // ISO timestamp
  capacity?: number;
  slotSizeMinutes?: number;
  avgDiningMinutes?: number;
  turnoverMinutes?: number;
  timezone?: string;
}

function keyForAvailability(tenantId: string, dateKey: string): string {
  return `${redisConfig.prefixes.availability}:${tenantId}:${dateKey}`;
}

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export class AvailabilityCache {
  private readonly defaultTtl = redisConfig.ttlSeconds;

  async getAvailability(tenantId: string, dateKey: string): Promise<AvailabilityPayload | null> {
    const key = keyForAvailability(tenantId, dateKey);
    const raw = await redis.get(key);
    return safeParse<AvailabilityPayload>(raw);
  }

  async setAvailability(
    tenantId: string,
    dateKey: string,
    payload: AvailabilityPayload,
    ttlSec: number = this.defaultTtl,
  ): Promise<void> {
    const key = keyForAvailability(tenantId, dateKey);
    const value = JSON.stringify(payload);
    await redis.set(key, value, { EX: ttlSec });
  }

  async invalidateAvailabilityForDate(tenantId: string, dateKey: string): Promise<number> {
    const key = keyForAvailability(tenantId, dateKey);
    return await redis.del(key);
  }

  async invalidateAvailabilityByTenant(tenantId: string): Promise<number> {
    let deleted = 0;
    const match = `${redisConfig.prefixes.availability}:${tenantId}:*`;
    for await (const key of redis.scanIterator({ MATCH: match, COUNT: 100 })) {
      if (typeof key === 'string') {
        deleted += await redis.del(key);
      }
    }
    return deleted;
  }
}
