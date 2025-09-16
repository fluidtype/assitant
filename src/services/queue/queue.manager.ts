import { Queue, Worker, Job, type ConnectionOptions } from 'bullmq';

import { scanAndTimeout } from '@services/conversation/timeout.worker.js';

import { logger } from '@utils/logger.js';

import { config } from '@config/env.config';

import type { WAEvent } from '../../types/index.js';

import { MessageProcessor } from './message.processor.js';

let queue: Queue<WAEvent> | undefined;
let worker: Worker<WAEvent> | undefined;
let timeoutInterval: NodeJS.Timeout | undefined;

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

  if (process.env.NODE_ENV !== 'production' && !timeoutInterval) {
    timeoutInterval = setInterval(
      () => {
        scanAndTimeout().catch((err) => {
          logger.error('[timeout] scan failed', { err });
        });
      },
      5 * 60 * 1000,
    );
    if (typeof timeoutInterval.unref === 'function') {
      timeoutInterval.unref();
    }
  }
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
