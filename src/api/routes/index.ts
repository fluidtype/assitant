import { Router } from 'express';

import healthRoutes from './health.routes.js';
import webhookRoutes from './webhook.routes.js';
import devRoutes from './dev.routes.js';
import devAvailabilityRoutes from './dev.availability.routes.js';
import devNluRoutes from './dev.nlu.routes.js';
import devAiRoutes from './dev.ai.routes.js';

const v1Router = Router();
v1Router.use(healthRoutes);
v1Router.use('/webhook', webhookRoutes);
if (process.env.NODE_ENV !== 'production') {
  v1Router.use(devRoutes);
  v1Router.use(devAvailabilityRoutes);
  v1Router.use(devNluRoutes);
  v1Router.use(devAiRoutes);
}

const router = Router();
router.use('/v1', v1Router);

export default router;
