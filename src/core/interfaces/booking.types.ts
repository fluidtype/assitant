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
