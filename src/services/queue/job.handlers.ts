import type { Job } from 'bullmq';

import type { WAEvent } from '../../types/index.js';

import { MessageProcessor } from './message.processor.js';

export async function processJob(job: Job<WAEvent>): Promise<void> {
  const processor = new MessageProcessor();
  await processor.processMessage(job);
}
