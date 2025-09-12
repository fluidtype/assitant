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

export interface IntentResult {
  intent: string;
  confidence: number;
}
