import { Router } from 'express';

import { EnhancedNLUService } from '@services/ai/nlu.service.js';
import { prisma } from '@infra/database/prisma.client.js';

const router = Router();
if (process.env.NODE_ENV !== 'production') {
  const nlu = new EnhancedNLUService();

  router.get('/dev/nlu/ping', (_req, res) => {
    res.json({ ok: true });
  });

  router.get('/dev/nlu/parse', async (req, res, next) => {
    try {
      const tenantId = String(req.query.tenantId ?? 'demo-tenant-aurora');
      const text = String(req.query.text ?? '');
      if (!text) return res.status(400).json({ message: 'text required' });
      const tenant = await (prisma as any).tenant.findUnique({ where: { id: tenantId } });
      if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
      const result = await nlu.parseWithContext(text, null, tenant as any);
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  router.post('/dev/nlu/parse', async (req, res, next) => {
    try {
      const tenantId = String(req.body?.tenantId ?? 'demo-tenant-aurora');
      const text = String(req.body?.text ?? '');
      if (!text) return res.status(400).json({ message: 'text required' });
      const tenant = await (prisma as any).tenant.findUnique({ where: { id: tenantId } });
      if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
      const result = await nlu.parseWithContext(text, null, tenant as any);
      res.json(result);
    } catch (e) {
      next(e);
    }
  });
}
export default router;
