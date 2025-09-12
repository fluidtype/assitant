import { NotImplementedError } from '../../core/errors/not-implemented.error.js';

export class MessageProcessor {
  process(_message: unknown) {
    throw new NotImplementedError();
  }
}
