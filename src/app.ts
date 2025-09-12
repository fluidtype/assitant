import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';

import { config } from '@config/env.config';

import apiRouter from './api/routes/index.js';
import { tenantMiddleware, errorMiddleware } from './middleware/index.js';

void config;

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

app.use(tenantMiddleware);
app.use('/', apiRouter);
app.use(errorMiddleware);

const PORT = config.PORT;
app.listen(PORT, () => {
  console.log(`Tom v2 up on ${PORT}`);
});
