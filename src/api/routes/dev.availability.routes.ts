import { Router } from 'express';

import { AvailabilityService } from '@services/booking/availability.service.js';

import { prisma } from '@infra/database/prisma.client.js';

const router = Router();
if (process.env.NODE_ENV !== 'production') {
  const svc = new AvailabilityService();
  // GET check: /v1/dev/availability/check?tenantId=...&startAtISO=...&endAtISO=...&people=...
  router.get('/dev/availability/check', async (req, res, next) => {
    try {
      const tenantId = String(req.query.tenantId ?? 'demo-tenant-aurora');
      const startAtISO = String(req.query.startAtISO);
      const endAtISO = String(req.query.endAtISO);
      const people = Number(req.query.people ?? 2);
      const tenant = await (prisma as any).tenant.findUnique({ where: { id: tenantId } });
      if (!tenant) return res.status(404).json({ message: 'Tenant not found' });

      const { toZonedDate, tzOfTenant } = await import('@utils/time.js');
      const tz = tzOfTenant(tenant as any);
      const startAt = toZonedDate(startAtISO, tz);
      const endAt = toZonedDate(endAtISO, tz);

      const out = await svc.checkAvailability({ tenantId, startAt, endAt, people }, tenant as any);
      res.json(out);
    } catch (e) {
      next(e);
    }
  });

  // GET daily grid: /v1/dev/availability/:date?tenantId=...
  router.get('/dev/availability/:date(\\d{4}-\\d{2}-\\d{2})', async (req, res, next) => {
    try {
      const tenantId = String(req.query.tenantId ?? 'demo-tenant-aurora');
      const dateISO = String(req.params.date); // yyyy-MM-dd
      const tenant = await (prisma as any).tenant.findUnique({ where: { id: tenantId } });
      if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
      const slots = await svc.getDailyAvailability(tenant, dateISO);
      res.json({ date: dateISO, slots });
    } catch (e) {
      next(e);
    }
  });
}
export default router;
