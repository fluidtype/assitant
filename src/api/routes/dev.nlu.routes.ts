import { Router } from 'express';

import { EnhancedNLUService } from '@services/ai/nlu.service.js';
import { ResponseGenerator } from '@services/ai/response-generator.service.js';

import { prisma } from '@infra/database/prisma.client.js';

const router = Router();
if (process.env.NODE_ENV !== 'production') {
  const nlu = new EnhancedNLUService();
  const responder = new ResponseGenerator();

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
      const result = await nlu.parse(text, null, tenant as any);
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
      const result = await nlu.parse(text, null, tenant as any);
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  router.post('/dev/ai/respond', async (req, res, next) => {
    try {
      const tenantId = String(req.body?.tenantId ?? 'demo-tenant-aurora');
      const intent = String(req.body?.intent ?? '');
      if (!intent) {
        return res.status(400).json({ message: 'intent required' });
      }

      const tenant = await (prisma as any).tenant.findUnique({ where: { id: tenantId } });
      if (!tenant) {
        return res.status(404).json({ message: 'Tenant not found' });
      }

      const entities = (req.body?.entities ?? {}) as Record<string, unknown>;
      const missingInput = Array.isArray(req.body?.missing) ? req.body.missing : [];
      const missing: string[] = [];
      for (const item of missingInput) {
        if (typeof item !== 'string') {
          continue;
        }
        const trimmed = item.trim();
        if (trimmed) {
          missing.push(trimmed);
        }
      }
      const contextInput = req.body?.context as Record<string, unknown> | undefined;
      const rawState =
        contextInput && typeof contextInput.state === 'string' ? contextInput.state.trim() : '';
      const stateValue = rawState || 'IDLE';
      const knownSlots =
        contextInput && typeof contextInput.knownSlots === 'object'
          ? (contextInput.knownSlots as Record<string, unknown>)
          : undefined;

      const result = await responder.generate({
        tenant: tenant as any,
        intent,
        entities,
        missing,
        context: {
          state: stateValue,
          ...(knownSlots ? { knownSlots } : {}),
        },
      });

      res.json(result);
    } catch (e) {
      next(e);
    }
  });
}
export default router;
