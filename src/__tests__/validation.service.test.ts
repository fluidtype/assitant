import { describe, it, expect } from 'vitest';
import { DateTime } from 'luxon';

import { ValidationService } from '@services/booking/validation.service.js';

import { ValidationError } from '@core/errors/validation.error.js';

const tenant: any = {
  id: 't1',
  timezone: 'Europe/Rome',
  config: {
    openingHours: { mon: ['19:00-23:00'] },
    rules: { maxPeople: 5, minAdvanceMinutes: 60 },
  },
};

const service = new ValidationService();

function nextMondayAt(hour: number): DateTime {
  const now = DateTime.now().setZone('Europe/Rome');
  const daysToMon = (8 - now.weekday) % 7 || 7; // days until next Monday
  return now.plus({ days: daysToMon }).set({ hour, minute: 0, second: 0, millisecond: 0 });
}

describe('ValidationService', () => {
  it('allows booking within opening hours', () => {
    const start = nextMondayAt(20);
    const end = start.plus({ hours: 2 });
    service.validateCreate(
      {
        tenantId: tenant.id,
        name: 'Marco',
        people: 2,
        startAtISO: start.toISO()!,
        endAtISO: end.toISO()!,
      },
      tenant,
    );
  });

  it('enforces minAdvanceMinutes', () => {
    const start = DateTime.now().setZone('Europe/Rome').plus({ minutes: 30 });
    const end = start.plus({ hours: 1 });
    expect(() =>
      service.validateCreate(
        {
          tenantId: tenant.id,
          name: 'Marco',
          people: 2,
          startAtISO: start.toISO()!,
          endAtISO: end.toISO()!,
        },
        tenant,
      ),
    ).toThrow(ValidationError);
  });

  it('enforces maxPeople', () => {
    const start = nextMondayAt(20);
    const end = start.plus({ hours: 2 });
    expect(() =>
      service.validateCreate(
        {
          tenantId: tenant.id,
          name: 'Marco',
          people: 10,
          startAtISO: start.toISO()!,
          endAtISO: end.toISO()!,
        },
        tenant,
      ),
    ).toThrow(ValidationError);
  });
});
