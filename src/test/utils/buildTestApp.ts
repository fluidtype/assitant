import express from 'express';
import type { Router } from 'express';
import { errorMiddleware } from '@middleware/error.middleware.js';

export function buildTestApp(router: Router, base = '/v1') {
  const app = express();
  app.use(express.json());
  app.use(base, router);
  app.use(errorMiddleware);
  return app;
}
