import type { Tenant } from '@prisma/client';
import type { OpeningHoursMap, SpecialDayConfig } from '@core/interfaces/booking.types.js';

export interface AvailabilityRuntimeConfig {
  openingHours: OpeningHoursMap;
  capacity: number;
  rules: {
    maxPeople: number;
    minAdvanceMinutes: number;
  };
  /** Average dining time in minutes. Default 120. */
  avgDiningMinutes: number;
  /** Slot granularity in minutes. Default 30. */
  slotSizeMinutes: number;
  /** Table turnover buffer after a booking ends. Default 15. */
  turnoverMinutes: number;
  /** Specific day overrides. Key: 'yyyy-MM-dd'. If null/empty -> closed */
  specialDays?: SpecialDayConfig;
  /** Timezone to use (falls back to tenant.timezone). */
  timezone: string;
}

export function readAvailabilityConfig(tenant: Tenant): AvailabilityRuntimeConfig {
  const cfg = (tenant.config ?? {}) as any;
  return {
    openingHours: cfg.openingHours ?? {},
    capacity: typeof cfg.capacity === 'number' ? cfg.capacity : 50,
    rules: {
      maxPeople: cfg?.rules?.maxPeople ?? 8,
      minAdvanceMinutes: cfg?.rules?.minAdvanceMinutes ?? 60,
    },
    avgDiningMinutes: cfg?.avgDiningMinutes ?? 120,
    slotSizeMinutes: cfg?.slotSizeMinutes ?? 30,
    turnoverMinutes: cfg?.turnoverMinutes ?? 15,
    specialDays: cfg?.specialDays ?? undefined,
    timezone: tenant.timezone ?? 'Europe/Rome',
  };
}
