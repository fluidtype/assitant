import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';

import { config } from '@config/env.config';

import apiRouter from './api/routes/index.js';
import { rawBody, tenantMiddleware, errorMiddleware } from './middleware/index.js';
import { connectRedis, registerRedisShutdownSignals } from './infrastructure/redis/redis.client.js';

void config; // force env validation at startup

const app = express();

app.use(helmet());
app.use(cors());
app.use(rawBody);
app.use(express.json());

app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

app.use(tenantMiddleware);
app.use('/', apiRouter);
app.use(errorMiddleware);

const PORT = config.PORT;

async function bootstrap() {
  // connect Redis early so caches are ready
  await connectRedis();
  registerRedisShutdownSignals();

  app.listen(PORT, () => {
    console.log(`Tom v2 up on ${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error('Fatal bootstrap error:', err);
  process.exit(1);
});
