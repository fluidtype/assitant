import { redis } from '@infra/redis/redis.client.js';
import { redisConfig } from '@infra/redis/redis.config.js';

import type { ConversationState } from './state.types.js';

function keyFor(tenantId: string, phone: string): string {
  return `${redisConfig.prefixes.conversation}:${tenantId}:${phone.trim()}`;
}

function safeParse(raw: string | null): ConversationState | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ConversationState;
  } catch {
    return null;
  }
}

export interface SetStateCASOptions {
  expectedVersion: number | null;
  ttlSeconds?: number;
}

export interface SetStateCASResult {
  ok: boolean;
  current?: ConversationState | null;
}

export class ConversationStateStore {
  constructor(private readonly defaultTtl = redisConfig.ttlSeconds) {}

  async getState(tenantId: string, phone: string): Promise<ConversationState | null> {
    const key = keyFor(tenantId, phone);
    const raw = await redis.get(key);
    return safeParse(raw);
  }

  async setStateCAS(
    tenantId: string,
    phone: string,
    nextState: ConversationState,
    options: SetStateCASOptions,
  ): Promise<SetStateCASResult> {
    const key = keyFor(tenantId, phone);
    const ttl = options.ttlSeconds ?? this.defaultTtl;

    await redis.watch(key);
    try {
      const raw = await redis.get(key);
      const current = safeParse(raw);
      const currentVersion = current?.version ?? null;
      const expected = options.expectedVersion ?? null;

      if (expected === null) {
        if (currentVersion !== null) {
          await redis.unwatch();
          return { ok: false, current };
        }
      } else if (currentVersion !== expected) {
        await redis.unwatch();
        return { ok: false, current };
      }

      const expectedNext = (expected ?? 0) + 1;
      if (nextState.version !== expectedNext) {
        await redis.unwatch();
        throw new Error(
          `Invalid conversation state version: expected next version ${expectedNext}, received ${nextState.version}`,
        );
      }

      if (nextState.machineVersion !== 1) {
        await redis.unwatch();
        throw new Error(`Unsupported conversation machine version: ${nextState.machineVersion}`);
      }

      const multi = redis.multi();
      const payload = JSON.stringify(nextState);
      if (ttl && ttl > 0) {
        multi.set(key, payload, { EX: ttl });
      } else {
        multi.set(key, payload);
      }
      const execResult = await multi.exec();

      if (execResult === null) {
        await redis.unwatch();
        return { ok: false, current: await this.getState(tenantId, phone) };
      }

      return { ok: true };
    } catch (err) {
      await redis.unwatch();
      throw err;
    }
  }
}
