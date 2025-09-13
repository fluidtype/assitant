import { BaseError } from './base-error.js';

export class BusinessRuleError extends BaseError {
  constructor(message = 'Business rule violated') {
    super('BUSINESS_RULE', 409, message);
  }
}
