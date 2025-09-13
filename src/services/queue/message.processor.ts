import type { Job } from 'bullmq';

import { redis } from '@infra/redis/redis.client.js';

import type { WAEvent } from '../../types/index.js';
import { ConversationService } from '../conversation/conversation.service.js';
import { WhatsAppService } from '../messaging/whatsapp.service.js';

export class MessageProcessor {
  constructor(
    private conversation = new ConversationService(),
    private whatsapp = new WhatsAppService(),
  ) {}

  async processMessage(job: Job<WAEvent>): Promise<void> {
    const { tenantId, userPhone, messageId } = job.data;
    const dedupKey = `proc:${tenantId}:${messageId}`;
    const set = await redis.set(dedupKey, '1', { NX: true, EX: 60 * 60 * 24 });
    if (set !== 'OK') return;
    try {
      const { replyText } = await this.conversation.processMessage(job.data);
      await this.whatsapp.sendMessage(userPhone, replyText);
    } catch (err) {
      if (job.attemptsMade < (job.opts.attempts ?? 0)) {
        throw err as Error;
      }
      try {
        await this.whatsapp.sendMessage(
          userPhone,
          'Sorry, there was an error processing your request. Please try again later.',
        );
      } finally {
        await redis.del(dedupKey);
      }
    }
  }
}
