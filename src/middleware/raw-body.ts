import type { RequestHandler } from 'express';
import { raw } from 'express';

export const rawBody: RequestHandler = (req, res, next) => {
  raw({ type: '*/*' })(req, res, (err) => {
    if (err) return next(err);
    req.rawBody = req.body as Buffer;
    next();
  });
};
