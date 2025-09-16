import { Request, Response, NextFunction } from 'express';

import { redis } from '@infra/redis/redis.client.js';

const WINDOW_SEC = 15;
const MAX_MSG = 10;

export const rateLimitMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const phone = req.header('x-user-phone') ?? 'anon';
    const key = `ratelimit:${phone}`;
    const c = await redis.incr(key);
    if (c === 1) {
      await redis.expire(key, WINDOW_SEC);
    }
    if (c > MAX_MSG) {
      return res.status(429).json({ message: 'Troppi messaggi, riprova tra poco.' });
    }
  } catch (err) {
    // Ignore Redis errors to avoid blocking the webhook on rate limit issues
  }
  next();
};
