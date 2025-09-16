import { Router } from 'express';

import { rateLimitMiddleware } from '@middleware/rate-limit.middleware.js';

import healthRoutes from './health.routes.js';
import webhookRoutes from './webhook.routes.js';
import devRoutes from './dev.routes.js';
import devAvailabilityRoutes from './dev.availability.routes.js';
import devNluRoutes from './dev.nlu.routes.js';

const v1Router = Router();
v1Router.use(healthRoutes);
if (process.env.NODE_ENV === 'production') {
  v1Router.use('/webhook', rateLimitMiddleware, webhookRoutes);
} else {
  v1Router.use('/webhook', webhookRoutes);
  v1Router.use(devRoutes);
  v1Router.use(devAvailabilityRoutes);
  v1Router.use(devNluRoutes);
}

const router = Router();
router.use('/v1', v1Router);

export default router;
