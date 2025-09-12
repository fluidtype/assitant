import { createClient, type RedisClientType } from 'redis';

import { config } from '../../config/env.config.js';

export type RedisClient = RedisClientType;

export const redis: RedisClient = createClient({
  url: config.REDIS_URL,
});

redis.on('error', (err) => {
  // keep logs minimal but informative
  console.error('[redis] error:', err.message);
});

redis.on('connect', () => {
  console.info('[redis] connected');
});

redis.on('end', () => {
  console.info('[redis] connection closed');
});

export async function connectRedis(): Promise<void> {
  if (!redis.isOpen) {
    await redis.connect();
  }
}

export async function disconnectRedis(): Promise<void> {
  if (redis.isOpen) {
    await redis.quit();
  }
}

export async function pingRedis(): Promise<string> {
  await connectRedis();
  return redis.ping();
}

// Optional: graceful shutdown registration (call from app bootstrap if desired)
export function registerRedisShutdownSignals(): void {
  const handler = async (signal: NodeJS.Signals) => {
    try {
      console.info(`[redis] received ${signal}, closing...`);
      await disconnectRedis();
    } finally {
      process.exit(0);
    }
  };
  process.once('SIGINT', handler);
  process.once('SIGTERM', handler);
}
