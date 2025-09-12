import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

export const errorMiddleware = (err: Error, _req: Request, res: Response, _next: NextFunction) => {
  const traceId = randomUUID();
  res.status(500).json({ message: err.message, traceId });
};
