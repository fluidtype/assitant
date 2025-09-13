import { Queue, Worker, Job, type ConnectionOptions } from 'bullmq';

import { config } from '@config/env.config';

import type { WAEvent } from '../../types/index.js';

import { MessageProcessor } from './message.processor.js';

const connection = { url: config.REDIS_URL } as unknown as ConnectionOptions;

export const queue = new Queue<WAEvent>('messages', { connection });

export const worker = new Worker<WAEvent>(
  'messages',
  async (job: Job<WAEvent>) => {
    const processor = new MessageProcessor();
    await processor.processMessage(job);
  },
  {
    connection,
    concurrency: config.QUEUE_CONCURRENCY,
    settings: {
      retryProcessDelay: 0,
    } as any,
  },
);

export function enqueue(data: WAEvent) {
  return queue.add('message', data, {
    jobId: data.messageId,
    removeOnComplete: true,
    removeOnFail: 50,
    attempts: config.QUEUE_MAX_ATTEMPTS,
    backoff: { type: 'fixed', delay: 2000 },
  });
}
