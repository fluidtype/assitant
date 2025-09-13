import { BaseError } from './base-error.js';

export class ValidationError extends BaseError {
  constructor(message = 'Validation failed') {
    super('VALIDATION_ERROR', 422, message);
  }
}
