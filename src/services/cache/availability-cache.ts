import { NotImplementedError } from '../../core/errors/not-implemented.error.js';

export class AvailabilityCache {
  get(_key: string) {
    return null;
  }
  set(_key: string, _value: unknown) {
    throw new NotImplementedError();
  }
}
