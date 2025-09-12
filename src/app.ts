import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';

import 'dotenv/config';
import apiRouter from './api/routes/index.js';
import { tenantMiddleware, errorMiddleware } from './middleware/index.js';

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

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`Tom v2 up on ${PORT}`);
});
