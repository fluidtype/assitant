export type BookingStatus = 'confirmed' | 'cancelled';

export interface CreateBookingDTO {
  tenantId: string;
  userPhone?: string | null;
  name: string;
  people: number;
  startAtISO: string;
  endAtISO: string;
}

export interface ModifyBookingDTO {
  id: string;
  tenantId: string;
  patch: {
    name?: string;
    people?: number;
    startAtISO?: string;
    endAtISO?: string;
    status?: BookingStatus;
  };
  expectedVersion?: number;
}

export interface AvailabilityCheckInput {
  tenantId: string;
  startAt: Date;
  endAt: Date;
  people: number;
}

export interface AvailabilityCheckResult {
  available: boolean;
  capacity: number;
  used: number;
  left: number;
  reason?: 'closed' | 'past' | 'capacity' | 'rules' | 'invalid';
}

export interface BookingQueryFilters {
  tenantId: string;
  userPhone?: string;
  dateFrom?: Date;
  dateTo?: Date;
  status?: BookingStatus[];
}

export interface OpeningHoursMap {
  sun?: string[];
  mon?: string[];
  tue?: string[];
  wed?: string[];
  thu?: string[];
  fri?: string[];
  sat?: string[];
  // each string is "HH:mm-HH:mm"
}

export interface SpecialDayConfig {
  /** ISO date 'yyyy-MM-dd' -> array of "HH:mm-HH:mm"; if empty array or null -> closed */
  [isoDate: string]: string[] | null | undefined;
}

export interface AvailabilitySlotDetail {
  start: string; // ISO string
  end: string; // ISO string
  capacity: number;
  used: number;
  left: number;
  available: boolean;
}

export interface AlternativeSuggestion {
  start: string; // ISO
  end: string; // ISO
  left: number; // seats left at that slot considering duration
  reason?: 'shift_earlier' | 'shift_later' | 'closest';
}

export interface IntelligentAvailabilityResult extends AvailabilityCheckResult {
  /** If the requested window is unavailable, provide up to N alternative windows (sorted by closeness). */
  alternatives?: AlternativeSuggestion[];
}
