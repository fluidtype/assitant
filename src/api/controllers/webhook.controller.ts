import { Request, Response } from 'express';

export const verify = (_req: Request, res: Response) => res.json({ ok: true, mode: 'verify' });
export const handle = (_req: Request, res: Response) => res.json({ ok: true, mode: 'handle' });
