import { randomUUID } from 'node:crypto';

import { Router } from 'express';

import { EnhancedNLUService } from '@services/ai/nlu.service.js';
import { ConversationService } from '@services/conversation/conversation.service.js';

import { prisma } from '@infra/database/prisma.client.js';

const router = Router();

if (process.env.NODE_ENV !== 'production') {
  const nlu = new EnhancedNLUService();
  const conversation = new ConversationService();

  router.post('/dev/ai/respond', async (req, res, next) => {
    try {
      const tenantId = String(req.body?.tenantId ?? 'demo-tenant-aurora');
      const userPhone = String(req.body?.userPhone ?? '+390000000000');
      const text = String(req.body?.text ?? '');
      if (!text) {
        return res.status(400).json({ message: 'text required' });
      }

      const tenant = await (prisma as any).tenant.findUnique({ where: { id: tenantId } });
      if (!tenant) {
        return res.status(404).json({ message: 'Tenant not found' });
      }

      const intent = await nlu.parseWithContext(text, null, tenant as any);
      const event = {
        tenantId,
        userPhone,
        message: text,
        messageId: randomUUID(),
      } as const;
      const reply = await conversation.processMessage(event, intent);

      res.json({ intent, reply });
    } catch (err) {
      next(err);
    }
  });
}

export default router;