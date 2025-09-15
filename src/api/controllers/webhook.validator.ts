import crypto from 'crypto';

import type { Request } from 'express';

import { config } from '@config/env.config';

export function verifySignature(req: Request): boolean {
  const signature = req.headers['x-hub-signature-256'];
  if (typeof signature !== 'string') return false;
  if (!config.WHATSAPP_APP_SECRET) {
    throw new Error('WHATSAPP_APP_SECRET is not configured');
  }
  const body = req.body as Buffer;
  const expected =
    'sha256=' + crypto.createHmac('sha256', config.WHATSAPP_APP_SECRET).update(body).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
