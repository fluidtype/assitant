import crypto from 'crypto';

import { prisma } from '@infra/database/prisma.client.js';

function hashKey(str: string): number {
  // signed 32-bit int for pg advisory lock
  return crypto.createHash('md5').update(str).digest().readInt32BE(0);
}

export async function pgAdvisoryXactLock(key: string): Promise<void> {
  const k = hashKey(key);
  await (prisma as any).$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${k})`);
}
