export interface IBooking {
  id: string;
}

export interface ITenant {
  id: string;
  name: string;
}

export interface AvailabilityResult {
  available: boolean;
}

export type IntentName =
  | 'CREATE_BOOKING'
  | 'MODIFY_BOOKING'
  | 'CANCEL_BOOKING'
  | 'GET_INFO'
  | 'CONFIRM_BOOKING'
  | 'UNKNOWN';

export interface IntentEntity<T = unknown> {
  value?: T;
  confidence?: number;
  original?: string;
  [key: string]: unknown;
}

export interface IntentAmbiguity {
  field: string;
  options?: IntentEntity[];
  [key: string]: unknown;
}

export interface IntentResult {
  intent: IntentName;
  confidence: number;
  entities: Record<string, IntentEntity | undefined>;
  missing: string[];
  ambiguity: IntentAmbiguity[];
  warnings: string[];
}

export * from './booking.types.js';
