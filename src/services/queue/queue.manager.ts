import { Queue, Worker, Job, type ConnectionOptions } from 'bullmq';

import { config } from '@config/env.config';

import type { WAEvent } from '../../types/index.js';

import { MessageProcessor } from './message.processor.js';

let queue: Queue<WAEvent> | undefined;
let worker: Worker<WAEvent> | undefined;

function createConnection(): ConnectionOptions {
  return { url: config.REDIS_URL } as ConnectionOptions;
}

export function startQueue(): void {
  if (queue && worker) return;
  const connection = createConnection();
  queue = new Queue<WAEvent>('messages', { connection });
  worker = new Worker<WAEvent>(
    'messages',
    async (job: Job<WAEvent>) => {
      const processor = new MessageProcessor();
      await processor.processMessage(job);
    },
    {
      connection,
      concurrency: config.QUEUE_CONCURRENCY,
      settings: { retryProcessDelay: 0 } as any,
    },
  );
}

export function enqueue(data: WAEvent) {
  if (!queue) throw new Error('Queue not started');
  return queue.add('message', data, {
    jobId: data.messageId,
    removeOnComplete: true,
    removeOnFail: 50,
    attempts: config.QUEUE_MAX_ATTEMPTS,
    backoff: { type: 'fixed', delay: 2000 },
  });
}
