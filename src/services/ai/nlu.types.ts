export type NLUIntent =
  | 'CREATE_BOOKING'
  | 'MODIFY_BOOKING'
  | 'CANCEL_BOOKING'
  | 'ASK_INFO'
  | 'CONFIRMATION'
  | 'UNKNOWN';

export interface TemporalRef {
  dateISO?: string;
  timeISO?: string;
  raw?: string;
  granularity?: 'day' | 'time' | 'partOfDay';
}

export interface PartySize {
  value?: number;
  raw?: string;
}

export interface PersonName {
  full?: string;
}

export interface Phone {
  e164?: string;
  raw?: string;
}

export interface NLUEntities {
  when?: TemporalRef;
  people?: PartySize;
  name?: PersonName;
  phone?: Phone;
  bookingRef?: string;
}

export type MissingField = 'when' | 'time' | 'people' | 'name' | 'phone' | 'bookingRef';

export interface NLUResult {
  intent: NLUIntent;
  entities: NLUEntities;
  confidence: number;
  missing: MissingField[];
  ambiguity?: string[];
  trace?: {
    model?: string;
    latencyMs?: number;
    promptVersion?: string;
    cache?: boolean;
  };
}
