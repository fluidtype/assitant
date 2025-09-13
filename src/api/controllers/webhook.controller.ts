import { Request, Response } from 'express';

import { config } from '@config/env.config';

import { enqueue } from '../../services/queue/queue.manager.js';

import { verifySignature } from './webhook.validator.js';

export const verifyHandler = (req: Request, res: Response): void => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === config.WHATSAPP_VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
};

export const webhookHandler = (req: Request, res: Response): void => {
  if (!verifySignature(req)) {
    res.sendStatus(401);
    return;
  }
  let payload: any = req.body;
  if (Buffer.isBuffer(payload)) {
    try {
      payload = JSON.parse(payload.toString('utf8'));
    } catch {
      payload = {};
    }
  }
  const entries = payload.entry ?? [];
  for (const entry of entries) {
    const changes = entry.changes ?? [];
    for (const change of changes) {
      const messages = change.value?.messages ?? [];
      for (const msg of messages) {
        if (msg.type === 'text') {
          const event = {
            tenantId: req.tenantId ?? 'demo',
            userPhone: msg.from,
            message: msg.text.body,
            messageId: msg.id,
          };
          void enqueue(event);
        }
      }
    }
  }
  res.sendStatus(200);
};
