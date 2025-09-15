import { Request, Response, NextFunction } from 'express';

export const validationMiddleware = (_req: Request, _res: Response, next: NextFunction) => {
  // TODO: implement validation
  next();
};
