import { NotImplementedError } from '../../core/errors/not-implemented.error.js';

export class QueueManager {
  enqueue(_job: unknown) {
    throw new NotImplementedError();
  }
}
