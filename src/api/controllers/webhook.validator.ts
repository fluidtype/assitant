import crypto from 'crypto';

import type { Request } from 'express';

import { config } from '@config/env.config';

export function verifySignature(req: Request): boolean {
  const signature = req.headers['x-hub-signature-256'];
  if (typeof signature !== 'string') return false;
  const expected =
    'sha256=' +
    crypto
      .createHmac('sha256', config.WHATSAPP_APP_SECRET)
      .update(req.rawBody ?? '')
      .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
