import { BaseError } from './base-error.js';

export class ConflictError extends BaseError {
  constructor(message = 'Conflict', data?: unknown) {
    super('CONFLICT', 409, message);
    (this as any).data = data;
  }
}
