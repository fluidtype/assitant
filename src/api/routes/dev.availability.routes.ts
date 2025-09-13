import { Router } from 'express';
import { prisma } from '@infra/database/prisma.client.js';
import { AvailabilityService } from '@services/booking/availability.service.js';
import { formatYMD } from '@utils/time.js';

const router = Router();
if (process.env.NODE_ENV !== 'production') {
  const svc = new AvailabilityService();

  // GET daily grid: /v1/dev/availability/:date?tenantId=...
  router.get('/dev/availability/:date', async (req, res, next) => {
    try {
      const tenantId = String(req.query.tenantId ?? 'demo-tenant-aurora');
      const dateStr = String(req.params.date); // yyyy-MM-dd
      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
      if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
      const tz = tenant.timezone ?? 'Europe/Rome';
      const dayISO = formatYMD(new Date(dateStr), tz);
      const slots = await svc.getDailyAvailability(tenant, dayISO);
      res.json({ date: dayISO, slots });
    } catch (e) { next(e); }
  });

  // GET check: /v1/dev/availability/check?tenantId=...&startAtISO=...&endAtISO=...&people=...
  router.get('/dev/availability/check', async (req, res, next) => {
    try {
      const tenantId = String(req.query.tenantId ?? 'demo-tenant-aurora');
      const startAtISO = String(req.query.startAtISO);
      const endAtISO   = String(req.query.endAtISO);
      const people     = Number(req.query.people ?? 2);
      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
      if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
      const tz = tenant.timezone ?? 'Europe/Rome';
      const startAt = new Date(startAtISO);
      const endAt   = new Date(endAtISO);
      const out = await svc.checkAvailability({ tenantId, startAt, endAt, people }, tenant as any);
      res.json({ day: formatYMD(startAt, tz), ...out });
    } catch (e) { next(e); }
  });
}
export default router;
