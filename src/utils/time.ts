import { DateTime } from 'luxon';
import type { Tenant } from '@prisma/client';

import { config } from '@config/env.config';

export function tzOfTenant(tenant: Pick<Tenant, 'timezone'> | { timezone?: string }): string {
  return tenant.timezone || config.TIMEZONE || 'Europe/Rome';
}

export function toZonedDate(iso: string, tz: string): Date {
  // accept ISO without TZ as local-in-tz; with TZ keep it; return JS Date in UTC instant
  const dt = DateTime.fromISO(iso, { zone: tz });
  if (!dt.isValid) throw new Error('Invalid ISO datetime: ' + iso);
  return dt.toJSDate();
}

export function formatYMD(date: Date, tz: string): string {
  return DateTime.fromJSDate(date).setZone(tz).toFormat('yyyy-LL-dd');
}

export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && aEnd > bStart;
}
