import { BaseError } from './base-error.js';

export class NotImplementedError extends BaseError {
  constructor(message = 'Not implemented') {
    super('NOT_IMPLEMENTED', 501, message);
  }
}
