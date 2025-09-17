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

export const INTENT_NAMES = [
  'CREATE_BOOKING',
  'MODIFY_BOOKING',
  'CANCEL_BOOKING',
  'GET_INFORMATION',
  'CONFIRMATION',
  'UNKNOWN',
] as const;

export type IntentName = (typeof INTENT_NAMES)[number];

export interface IntentResult {
  intent: IntentName;
  confidence: number;
  entities: Record<string, unknown>;
  missing: string[];
  ambiguity: string[];
  warnings: string[];
}

export * from './booking.types.js';
