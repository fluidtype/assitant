import { Router } from 'express';
import { verify, handle } from '../controllers/webhook.controller.js';

const router = Router();
router.get('/', verify);
router.post('/', handle);

export default router;
