import { Router } from 'express';
import type { Tenant } from '@prisma/client';
import { DateTime } from 'luxon';
import { prisma } from '@infra/database/prisma.client.js';
import { AvailabilityService } from '@services/booking/availability.service.js';

const router = Router();
if (process.env.NODE_ENV !== 'production') {
  const svc = new AvailabilityService();

  // GET check: /v1/dev/availability/check?tenantId=...&startAtISO=...&endAtISO=...&people=...
  router.get('/dev/availability/check', async (req, res, next) => {
    try {
      const tenantId = String(req.query.tenantId ?? '').trim();
      const startAtISO = String(req.query.startAtISO ?? '');
      const endAtISO = String(req.query.endAtISO ?? '');
      const people = Number(req.query.people);

      if (!tenantId || !startAtISO || !endAtISO || !Number.isInteger(people) || people < 1) {
        return res.status(400).json({ message: 'Invalid query params' });
      }

      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
      if (!tenant) return res.status(404).json({ message: 'Tenant not found' });

      const tz = tenant.timezone ?? 'Europe/Rome';
      const startDt = DateTime.fromISO(startAtISO, { zone: tz });
      const endDt = DateTime.fromISO(endAtISO, { zone: tz });
      if (!startDt.isValid || !endDt.isValid) {
        return res.status(400).json({ message: 'Invalid query params' });
      }

      const out = await svc.checkAvailability(
        { tenantId, startAt: startDt.toJSDate(), endAt: endDt.toJSDate(), people },
        tenant as Tenant,
      );
      res.json(out);
    } catch (e) {
      next(e);
    }
  });

  // GET daily grid: /v1/dev/availability/:date?tenantId=...
  router.get('/dev/availability/:date(\\d{4}-\\d{2}-\\d{2})', async (req, res, next) => {
    try {
      const tenantId = String(req.query.tenantId ?? 'demo-tenant-aurora');
      const dateStr = String(req.params.date); // yyyy-MM-dd
      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
      if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
      const tz = tenant.timezone ?? 'Europe/Rome';
      const day = DateTime.fromISO(dateStr, { zone: tz });
      if (!day.isValid) return res.status(400).json({ message: 'Invalid date' });
      const dayISO = day.toISODate();
      const slots = await svc.getDailyAvailability(tenant as Tenant, dayISO);
      res.json({ date: dayISO, slots });
    } catch (e) {
      next(e);
    }
  });
}
export default router;
