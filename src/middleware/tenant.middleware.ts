import { Request, Response, NextFunction } from 'express';

export const tenantMiddleware = (req: Request & { tenantId?: string }, _res: Response, next: NextFunction) => {
  req.tenantId = req.header('x-tenant-id') || 'demo';
  next();
};
