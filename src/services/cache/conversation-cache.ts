import { NotImplementedError } from '../../core/errors/not-implemented.error.js';

export class ConversationCache {
  get(_id: string) {
    return null;
  }
  set(_id: string, _value: unknown) {
    throw new NotImplementedError();
  }
}
