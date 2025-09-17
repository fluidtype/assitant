import { Router, type Request, type Response, type NextFunction } from 'express';
import type { WAEvent } from '@types/index.js';

import { EnhancedNLUService } from '@services/ai/nlu.service.js';
import { ConversationService } from '@services/conversation/conversation.service.js';

import { prisma } from '@infra/database/prisma.client.js';

const router = Router();

if (process.env.NODE_ENV !== 'production') {
  const conversation = new ConversationService();

  router.post('/dev/ai/respond', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { tenantId, userPhone, text } = req.body ?? {};
      if (!tenantId || !userPhone || !text) {
        return res.status(400).json({ message: 'tenantId, userPhone and text are required' });
      }

      let tenant: any = null;
      let tenantError: string | undefined;
      try {
        tenant = await (prisma as any).tenant.findUnique({ where: { id: tenantId } });
      } catch (err) {
        tenantError = err instanceof Error ? err.message : 'tenant_lookup_failed';
      }

      const fallbackTenant = tenant ?? {
        id: tenantId,
        name: tenantId,
        timezone: 'Europe/Rome',
        config: {},
        features: {},
      };

      let nlu: unknown = null;
      let nluError: string | undefined;
      try {
        const nluService = new EnhancedNLUService();
        nlu = await nluService.parseWithContext(text, null, fallbackTenant as any);
      } catch (err) {
        nluError = err instanceof Error ? err.message : 'nlu_unavailable';
      }

      const event: WAEvent = {
        tenantId,
        userPhone,
        message: text,
        messageId: req.body?.messageId ?? `dev-${Date.now().toString(36)}`,
      };
      const { replyText } = await conversation.processMessage(event);

      const payload: Record<string, unknown> = { replyText };
      if (nlu) payload.nlu = nlu;
      if (nluError) payload.nluError = nluError;
      if (!tenant && !tenantError) payload.tenantFound = false;
      if (tenantError) payload.tenantError = tenantError;

      res.json(payload);
    } catch (err) {
      next(err);
    }
  });
}

export default router;
