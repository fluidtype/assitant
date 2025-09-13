import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { DateTime } from 'luxon';

import { AvailabilityService } from '@services/booking/availability.service.js';
import { BookingRepository } from '@core/repositories/booking.repo.js';
import { prisma } from '@infra/database/prisma.client.js';

class MemoryCache {
  private store = new Map<string, any>();
  private key(t: string, d: string) {
    return `${t}:${d}`;
  }
  async getAvailability(t: string, d: string) {
    return this.store.get(this.key(t, d)) ?? null;
  }
  async setAvailability(t: string, d: string, payload: any) {
    this.store.set(this.key(t, d), payload);
  }
  async invalidateAvailabilityForDate(t: string, d: string) {
    this.store.delete(this.key(t, d));
    return 1;
  }
  async invalidateAvailabilityByTenant(t: string) {
    let c = 0;
    for (const k of [...this.store.keys()]) {
      if (k.startsWith(`${t}:`)) {
        this.store.delete(k);
        c++;
      }
    }
    return c;
  }
}

const db = prisma as any;
const tenantId = 'tenant-int';
const tz = 'Europe/Rome';
const dayISO = '2030-06-04'; // Tuesday
const sundayISO = '2030-06-09';

beforeEach(async () => {
  await db.booking.deleteMany();
  await db.tenant.deleteMany();
  await db.tenant.create({
    data: {
      id: tenantId,
      name: 'Int Tenant',
      timezone: tz,
      config: {
        capacity: 10,
        openingHours: {
          tue: ['19:00-23:00'],
          wed: ['19:00-23:00'],
          thu: ['19:00-23:00'],
          fri: ['19:00-23:00'],
          sat: ['19:00-23:00'],
        },
        avgDiningMinutes: 120,
        slotSizeMinutes: 30,
        turnoverMinutes: 15,
      },
    },
  });

  const start = DateTime.fromISO(`${dayISO}T19:00:00`, { zone: tz }).toJSDate();
  const end = DateTime.fromISO(`${dayISO}T21:00:00`, { zone: tz }).toJSDate();
  await db.booking.create({
    data: {
      tenantId,
      userPhone: '+393000000001',
      name: 'Existing',
      people: 8,
      startAt: start,
      endAt: end,
      status: 'confirmed',
    },
  });
});

afterAll(async () => {
  await db.$disconnect();
});

describe('Intelligent AvailabilityService', () => {
  const service = new AvailabilityService(new BookingRepository(), new MemoryCache() as any);

  it('computes daily grid with turnover', async () => {
    const tenant = await db.tenant.findUnique({ where: { id: tenantId } });
    const grid = await service.getDailyAvailability(tenant!, dayISO);
    expect(grid.length).toBe(8);
    for (let i = 0; i < 5; i++) {
      expect(grid[i].used).toBe(8);
      expect(grid[i].left).toBe(2);
    }
    for (let i = 5; i < grid.length; i++) {
      expect(grid[i].used).toBe(0);
      expect(grid[i].left).toBe(10);
    }
  });

  it('suggests alternatives when capacity exceeded', async () => {
    const tenant = await db.tenant.findUnique({ where: { id: tenantId } });
    const start = DateTime.fromISO(`${dayISO}T19:30:00`, { zone: tz }).toJSDate();
    const end = DateTime.fromISO(`${dayISO}T21:30:00`, { zone: tz }).toJSDate();
    const res = await service.checkAvailability(
      { tenantId, startAt: start, endAt: end, people: 2 },
      tenant!,
    );
    expect(res.available).toBe(false);
    expect(res.reason).toBe('capacity');
    expect(res.alternatives?.some((a) => a.start.includes('21:30'))).toBe(true);
  });

  it('returns invalid when window exceeds closing', async () => {
    const tenant = await db.tenant.findUnique({ where: { id: tenantId } });
    const start = DateTime.fromISO(`${dayISO}T21:30:00`, { zone: tz }).toJSDate();
    const end = DateTime.fromISO(`${dayISO}T23:30:00`, { zone: tz }).toJSDate();
    const res = await service.checkAvailability(
      { tenantId, startAt: start, endAt: end, people: 2 },
      tenant!,
    );
    expect(res.available).toBe(false);
    expect(['closed', 'invalid']).toContain(res.reason);
  });

  it('handles special day overrides', async () => {
    const tenant = await db.tenant.findUnique({ where: { id: tenantId } });
    const gridClosed = await service.getDailyAvailability(tenant!, sundayISO);
    expect(gridClosed.length).toBe(0);
    await db.tenant.update({
      where: { id: tenantId },
      data: {
        config: {
          capacity: 10,
          openingHours: tenant!.config.openingHours,
          avgDiningMinutes: 120,
          slotSizeMinutes: 30,
          turnoverMinutes: 15,
          specialDays: { [sundayISO]: ['19:00-22:00'] },
        },
      },
    });
    const tenant2 = await db.tenant.findUnique({ where: { id: tenantId } });
    const service2 = new AvailabilityService(new BookingRepository(), new MemoryCache() as any);
    const gridOpen = await service2.getDailyAvailability(tenant2!, sundayISO);
    expect(gridOpen.length).toBeGreaterThan(0);
  });
});

