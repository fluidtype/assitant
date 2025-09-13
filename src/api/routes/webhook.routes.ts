import { Router } from 'express';

import { verifyHandler, webhookHandler } from '../controllers/webhook.controller.js';
import { rawBody } from '../../middleware/raw-body.js';

const router = Router();
router.get('/', verifyHandler);
router.post('/', rawBody, webhookHandler);

export default router;
