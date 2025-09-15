import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { AddressInfo } from 'net';
import { DateTime } from 'luxon';

import devRoutes from '@api/routes/dev.routes.js';
import { buildTestApp } from '@test/utils/buildTestApp.js';
import { prisma } from '@infra/database/prisma.client.js';

const db = prisma as any;

let server: any;
let baseUrl: string;

beforeAll(async () => {
  const app = buildTestApp(devRoutes);
  server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://localhost:${port}/v1`;
});

afterAll(async () => {
  await db.$disconnect?.();
  await new Promise((resolve) => server.close(resolve));
});

describe('booking conflict alternatives', () => {
  it('returns suggestions on capacity conflict', async () => {
    const TENANT = 'demo-tenant-aurora';
    const DAY = '2025-09-19';
    const start = DateTime.fromISO(`${DAY}T20:00:00`, { zone: 'Europe/Rome' });
    const end = start.plus({ hours: 2 });
    const dayStart = start.startOf('day').toJSDate();
    const dayEnd = start.endOf('day').toJSDate();

    await db.tenant.upsert({
      where: { id: TENANT },
      update: {},
      create: {
        id: TENANT,
        name: 'Demo Ristorante Aurora',
        timezone: 'Europe/Rome',
        config: {
          openingHours: { tue: ['19:00-23:00'], wed: ['19:00-23:00'], thu: ['19:00-23:00'], fri: ['19:00-23:00'], sat: ['19:00-23:00'], sun: ['19:00-23:00'], mon: ['19:00-23:00'] },
          capacity: 50,
          rules: { maxPeople: 8, minAdvanceMinutes: 60 },
        },
      },
    });

    await db.booking.deleteMany({ where: { tenantId: TENANT, startAt: { gte: dayStart, lt: dayEnd } } });

    for (let i = 0; i < 6; i++) {
      await db.booking.create({
        data: {
          tenantId: TENANT,
          userPhone: null,
          name: `Seed_${i}`,
          people: 8,
          startAt: start.toJSDate(),
          endAt: end.toJSDate(),
        },
      });
    }

    const res = await fetch(`${baseUrl}/dev/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenantId: TENANT,
        name: 'Full',
        people: 8,
        startAtISO: start.toISO(),
        endAtISO: end.toISO(),
      }),
    });

    expect(res.status).toBe(409);
    const body = (await res.json()) as any;
    expect(body.message).toBe('Disponibilità insufficiente');
    expect(body.data.reason).toBe('capacity');
    expect(Array.isArray(body.data.alternatives)).toBe(true);
    expect(body.data.alternatives.length).toBeGreaterThan(0);
    for (const alt of body.data.alternatives) {
      expect(typeof alt.start).toBe('string');
      expect(typeof alt.end).toBe('string');
      expect(typeof alt.left).toBe('number');
    }
  });
});
