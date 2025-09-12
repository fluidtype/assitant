import { NotImplementedError } from '../../core/errors/not-implemented.error.js';

export class JobHandlers {
  handle(_job: unknown) {
    throw new NotImplementedError();
  }
}
