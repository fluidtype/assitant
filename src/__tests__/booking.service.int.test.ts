import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { DateTime } from 'luxon';

import { BookingService } from '@services/booking/booking.service.js';

import { BusinessRuleError } from '@core/errors/business-rule.error.js';
import { ConflictError } from '@core/errors/conflict.error.js';

import { prisma } from '@infra/database/prisma.client.js';

class NoopCache {
  async invalidateAvailabilityForDate() {}
}

const tenantId = 'tenant-test';
const tz = 'Europe/Rome';

function nextDayAt(hour: number): DateTime {
  return DateTime.now()
    .setZone(tz)
    .plus({ days: 1 })
    .set({ hour, minute: 0, second: 0, millisecond: 0 });
}

const db = prisma as any;

beforeEach(async () => {
  await db.booking.deleteMany();
  await db.tenant.deleteMany();
  await db.tenant.create({
    data: {
      id: tenantId,
      name: 'Test Tenant',
      timezone: tz,
      config: {
        capacity: 5,
        openingHours: {
          tue: ['19:00-23:00'],
          wed: ['19:00-23:00'],
          thu: ['19:00-23:00'],
          fri: ['19:00-23:00'],
          sat: ['19:00-23:00'],
          sun: ['19:00-23:00'],
          mon: ['19:00-23:00'],
        },
        rules: { maxPeople: 5, minAdvanceMinutes: 60 },
      },
    },
  });
});

afterAll(async () => {
  await db.$disconnect();
});

describe('BookingService integration', () => {
  it('creates and retrieves booking, handles conflicts and cancel', async () => {
    const service = new BookingService(
      undefined,
      undefined,
      undefined,
      undefined,
      new NoopCache() as any,
    );

    const start = nextDayAt(20);
    const end = start.plus({ hours: 2 });
    const created = await service.createBooking({
      tenantId,
      name: 'Marco',
      people: 4,
      startAtISO: start.toISO()!,
      endAtISO: end.toISO()!,
    });
    expect(created.id).toBeTruthy();
    const createdVersion = (created as any).version;

    await expect(
      service.createBooking({
        tenantId,
        name: 'Luigi',
        people: 2,
        startAtISO: start.toISO()!,
        endAtISO: end.toISO()!,
      }),
    ).rejects.toBeInstanceOf(BusinessRuleError);

    const updated = await service.modifyBooking({
      id: created.id,
      tenantId,
      expectedVersion: createdVersion,
      patch: { people: 3 },
    });
    expect(updated.people).toBe(3);

    await expect(
      service.modifyBooking({
        id: created.id,
        tenantId,
        expectedVersion: createdVersion,
        patch: { people: 2 },
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    const cancelled = await service.cancelBooking(created.id, tenantId);
    expect(cancelled.status).toBe('cancelled');
  });
});
