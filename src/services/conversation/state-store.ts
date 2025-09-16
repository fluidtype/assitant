import { randomUUID } from 'crypto';

import { redis } from '@infra/redis/redis.client.js';
import { redisConfig } from '@infra/redis/redis.config.js';

import type { ConversationState } from './state.types.js';

const TTL_SEC = Math.min(Math.max(redisConfig.ttlSeconds, 300), 3600); // 5m..60m
const KEY = (tenantId: string, phone: string) => `conv:${tenantId}:${phone}`;

const LUA_CAS_SET = `
-- KEYS[1] = key, ARGV[1] = expectedVersion (string or "null"), ARGV[2] = json, ARGV[3] = ttl
local key = KEYS[1]
local expected = ARGV[1]
local json = ARGV[2]
local ttl = tonumber(ARGV[3])

local current = redis.call('GET', key)
if not current then
  if expected ~= 'null' then return -1 end
  redis.call('SET', key, json, 'EX', ttl)
  return 1
else
  local ok, obj = pcall(cjson.decode, current)
  if not ok then return -2 end
  local ver = tonumber(obj['version']) or 0
  if expected == 'null' then return -3 end
  if ver ~= tonumber(expected) then return 0 end
  redis.call('SET', key, json, 'EX', ttl)
  return 1
end
`;

export async function getState(tenantId: string, phone: string): Promise<ConversationState | null> {
  const raw = await redis.get(KEY(tenantId, phone));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ConversationState;
  } catch {
    return null;
  }
}

export async function setStateCAS(
  tenantId: string,
  phone: string,
  next: ConversationState,
  expectedVersion: number | null,
): Promise<'ok' | 'version_mismatch' | 'corrupt' | 'precondition_failed'> {
  const code = await redis.eval(LUA_CAS_SET, {
    keys: [KEY(tenantId, phone)],
    arguments: [
      expectedVersion === null ? 'null' : String(expectedVersion),
      JSON.stringify(next),
      String(TTL_SEC),
    ],
  } as any);
  if (code === 1) return 'ok';
  if (code === 0) return 'version_mismatch';
  if (code === -2) return 'corrupt';
  return 'precondition_failed';
}

export function newEmptyState(): ConversationState {
  const now = new Date().toISOString();
  return {
    machineVersion: 1,
    version: 0,
    flow: 'IDLE',
    context: {},
    updatedAt: now,
  };
}

// Utility per id azione pendente
export const newPendingId = () => randomUUID();
