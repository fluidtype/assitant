import { describe, it, expect } from 'vitest';
import { DateTime } from 'luxon';
import type { Tenant } from '@prisma/client';

import { AvailabilityService } from '@services/booking/availability.service.js';

class FakeBookingRepo {
  async findOverlapping() {
    return [{ people: 6 }];
  }
}

describe('AvailabilityService', () => {
  it('calculates remaining capacity with overlaps', async () => {
    const tenant = {
      id: 't1',
      timezone: 'Europe/Rome',
      config: { capacity: 10 },
    } as unknown as Tenant;

    const service = new AvailabilityService(new FakeBookingRepo() as any);
    const start = DateTime.now().plus({ hours: 2 }).toJSDate();
    const end = DateTime.fromJSDate(start).plus({ hours: 2 }).toJSDate();
    const res = await service.checkAvailability(
      { tenantId: tenant.id, startAt: start, endAt: end, people: 5 },
      tenant,
    );
    expect(res.available).toBe(false);
    expect(res.used).toBe(6);
    expect(res.left).toBe(4);
    expect(res.reason).toBe('capacity');
  });
});
