import { randomUUID } from 'crypto';

import { Request, Response, NextFunction } from 'express';

import { BaseError } from '../core/errors/base-error.js';

export const errorMiddleware = (err: Error, _req: Request, res: Response, _next: NextFunction) => {
  const traceId = randomUUID();
  const status = err instanceof BaseError ? err.status : 500;
  res.status(status).json({ message: err.message, traceId });
};
