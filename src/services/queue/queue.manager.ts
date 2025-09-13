import { Queue, Worker, Job } from 'bullmq';

import { redis } from '@infra/redis/redis.client.js';

import { config } from '@config/env.config';

import type { WAEvent } from '../../types/index.js';

import { MessageProcessor } from './message.processor.js';

const connection: any = redis;

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
      backoffStrategy: (attempts: number) => (attempts === 1 ? 2000 : 5000),
      retryProcessDelay: 0,
    } as any,
  },
);

export function enqueue(data: WAEvent) {
  return queue.add('message', data, {
    jobId: data.messageId,
    attempts: config.QUEUE_MAX_ATTEMPTS,
    backoff: { type: 'fixed', delay: 2000 },
  });
}
