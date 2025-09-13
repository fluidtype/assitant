import type { Tenant } from '@prisma/client';

import type {
  AvailabilityCheckInput,
  AvailabilityCheckResult,
} from '@core/interfaces/booking.types.js';
import { BookingRepository } from '@core/repositories/booking.repo.js';

export class AvailabilityService {
  constructor(private readonly bookingRepo = new BookingRepository()) {}

  async checkAvailability(
    input: AvailabilityCheckInput,
    tenant: Tenant,
  ): Promise<AvailabilityCheckResult> {
    const capacity = (tenant.config as any)?.capacity ?? 50;
    const { startAt, endAt, people } = input;

    if (!(startAt < endAt) || people <= 0) {
      return { available: false, capacity, used: 0, left: capacity, reason: 'invalid' };
    }

    if (startAt < new Date()) {
      return { available: false, capacity, used: 0, left: capacity, reason: 'past' };
    }

    const overlaps = (await this.bookingRepo.findOverlapping(
      input.tenantId,
      startAt,
      endAt,
    )) as Array<{ people: number }>;

    const used = overlaps.reduce((sum, b) => sum + b.people, 0);
    const left = capacity - used;
    const available = left >= people;
    const result: AvailabilityCheckResult = { available, capacity, used, left };
    if (!available) result.reason = 'capacity';
    return result;
  }
}
