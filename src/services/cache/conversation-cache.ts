import { redis } from '../../infrastructure/redis/redis.client.js';
import { redisConfig } from '../../infrastructure/redis/redis.config.js';

export interface ConversationState {
  flow: string; // e.g., 'IDLE' | 'CREATING' | 'MODIFYING'
  context: unknown; // arbitrary JSON-safe context
  updatedAt: string; // ISO timestamp
}

function keyForConversation(tenantId: string, phone: string): string {
  const p = phone.trim();
  return `${redisConfig.prefixes.conversation}:${tenantId}:${p}`;
}

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export class ConversationCache {
  private readonly defaultTtl = redisConfig.ttlSeconds;

  async getState(tenantId: string, phone: string): Promise<ConversationState | null> {
    const key = keyForConversation(tenantId, phone);
    const raw = await redis.get(key);
    return safeParse<ConversationState>(raw);
  }

  async setState(
    tenantId: string,
    phone: string,
    state: ConversationState,
    ttlSec: number = this.defaultTtl,
  ): Promise<void> {
    const key = keyForConversation(tenantId, phone);
    const value = JSON.stringify(state);
    await redis.set(key, value, { EX: ttlSec });
  }

  async deleteState(tenantId: string, phone: string): Promise<void> {
    const key = keyForConversation(tenantId, phone);
    await redis.del(key);
  }
}
