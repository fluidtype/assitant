import { Router } from 'express';

import { verifyHandler, webhookHandler } from '../controllers/webhook.controller.js';

const router = Router();
router.get('/', verifyHandler);
router.post('/', webhookHandler);

export default router;
