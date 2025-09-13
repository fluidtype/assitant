import { BaseError } from './base-error.js';

export class ConflictError extends BaseError {
  constructor(message = 'Conflict') {
    super('CONFLICT', 409, message);
  }
}
