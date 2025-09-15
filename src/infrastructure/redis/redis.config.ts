import { config } from '../../config/env.config.js';

export const redisConfig = {
  ttlSeconds: Number(config.REDIS_TTL),
  prefixes: {
    conversation: 'conv',
    availability: 'avail',
  },
} as const;
