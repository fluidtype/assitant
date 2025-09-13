import { BaseError } from './base-error.js';

export class NotFoundError extends BaseError {
  constructor(message = 'Not found') {
    super('NOT_FOUND', 404, message);
  }
}
