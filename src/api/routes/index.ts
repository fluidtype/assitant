import { Router } from 'express';
import healthRoutes from './health.routes.js';
import webhookRoutes from './webhook.routes.js';

const v1Router = Router();
v1Router.use(healthRoutes);
v1Router.use('/webhook', webhookRoutes);

const router = Router();
router.use('/v1', v1Router);

export default router;
