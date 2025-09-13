import { DateTime, Interval } from 'luxon';
import type { Tenant } from '@prisma/client';

import type {
  AvailabilityCheckInput,
  IntelligentAvailabilityResult,
  AvailabilitySlotDetail,
  AlternativeSuggestion,
} from '@core/interfaces/booking.types.js';
import { BookingRepository } from '@core/repositories/booking.repo.js';
import { AvailabilityCache } from '@services/cache/availability-cache.js';
import { readAvailabilityConfig } from './config.defaults.js';
import { buildSlotsForDay } from './opening-hours.util.js';
import { formatYMD } from '@utils/time.js';

export class AvailabilityService {
  constructor(
    private readonly bookingRepo = new BookingRepository(),
    private readonly cache = new AvailabilityCache(),
  ) {}

  private async computeDailyGrid(tenant: Tenant, dayISO: string): Promise<AvailabilitySlotDetail[]> {
    const cfg = readAvailabilityConfig(tenant);
    const tz = cfg.timezone;
    const slots = buildSlotsForDay(dayISO, tz, cfg.openingHours, cfg.slotSizeMinutes, cfg.specialDays);
    if (slots.length === 0) return [];

    const dayStart = DateTime.fromISO(dayISO, { zone: tz }).startOf('day');
    const dayEnd = dayStart.endOf('day');

    const bookings = await this.bookingRepo.findOverlapping(
      tenant.id,
      dayStart.toJSDate(),
      dayEnd.toJSDate(),
    );

    interface Occupancy {
      interval: Interval;
      people: number;
    }
    const bookingIntervals: Occupancy[] = bookings.map((b: any) => ({
      interval: Interval.fromDateTimes(
        DateTime.fromJSDate(b.startAt, { zone: tz }),
        DateTime.fromJSDate(b.endAt, { zone: tz }).plus({ minutes: cfg.turnoverMinutes }),
      ),
      people: b.people,
    }));

    const validSlots = slots.filter((s) => s.start && s.end);
    return validSlots.map((slot) => {
      const used = bookingIntervals.reduce(
        (sum: number, b: Occupancy) => (b.interval.overlaps(slot) ? sum + b.people : sum),
        0,
      );
      const left = Math.max(cfg.capacity - used, 0);
      return {
        start: slot.start!.toISO(),
        end: slot.end!.toISO(),
        capacity: cfg.capacity,
        used,
        left,
        available: left > 0,
      } as AvailabilitySlotDetail;
    });
  }

  private mergeSlotsToWindow(
    grid: AvailabilitySlotDetail[],
    start: DateTime,
    durationMin: number,
    slotSize: number,
    tz: string,
  ): { ok: boolean; left: number } {
    const reqStart = start.setZone(tz, { keepLocalTime: false });
    const idx = grid.findIndex(
      (s) => DateTime.fromISO(s.start, { zone: tz }).toMillis() === reqStart.toMillis(),
    );
    if (idx === -1) return { ok: false, left: 0 };
    const needed = Math.ceil(durationMin / slotSize);
    let left = Infinity;
    for (let i = 0; i < needed; i++) {
      const current = grid[idx + i];
      if (!current) return { ok: false, left: 0 };
      if (i > 0) {
        const prevEnd = DateTime.fromISO(grid[idx + i - 1].end, { zone: tz }).toMillis();
        const currStart = DateTime.fromISO(current.start, { zone: tz }).toMillis();
        if (currStart !== prevEnd) return { ok: false, left: 0 };
      }
      if (!current.available) return { ok: false, left: Math.min(left, current.left) };
      left = Math.min(left, current.left);
    }
    return { ok: true, left: left === Infinity ? 0 : left };
  }

  private suggestAlternatives(
    grid: AvailabilitySlotDetail[],
    reqStart: DateTime,
    durationMin: number,
    tz: string,
    max = 6,
  ): AlternativeSuggestion[] {
    if (grid.length === 0) return [];
    const slotSize = DateTime.fromISO(grid[0].end, { zone: tz })
      .diff(DateTime.fromISO(grid[0].start, { zone: tz }), 'minutes')
      .minutes;
    const base = reqStart.setZone(tz, { keepLocalTime: false });
    const candidates: { start: DateTime; left: number }[] = [];
    for (const slot of grid) {
      const start = DateTime.fromISO(slot.start, { zone: tz });
      const { ok, left } = this.mergeSlotsToWindow(grid, start, durationMin, slotSize, tz);
      if (ok) {
        candidates.push({ start, left });
      }
    }
    const uniq = candidates.filter(
      (c, i, arr) => arr.findIndex((o) => o.start.toMillis() === c.start.toMillis()) === i,
    );
    const sorted = uniq
      .filter((c) => c.start.toMillis() !== base.toMillis())
      .sort(
        (a, b) =>
          Math.abs(a.start.diff(base).as('minutes')) -
          Math.abs(b.start.diff(base).as('minutes')),
      )
      .slice(0, max);
    return sorted.map((c, i) => ({
      start: c.start.toISO(),
      end: c.start.plus({ minutes: durationMin }).toISO(),
      left: c.left,
      reason: i === 0 ? 'closest' : c.start < base ? 'shift_earlier' : 'shift_later',
    }));
  }

  async getDailyAvailability(tenant: Tenant, dayISO: string): Promise<AvailabilitySlotDetail[]> {
    const cfg = readAvailabilityConfig(tenant);
    const cached = await this.cache.getAvailability(tenant.id, dayISO);
    if (
      cached &&
      cached.capacity === cfg.capacity &&
      cached.slotSizeMinutes === cfg.slotSizeMinutes &&
      cached.avgDiningMinutes === cfg.avgDiningMinutes &&
      cached.turnoverMinutes === cfg.turnoverMinutes &&
      cached.timezone === cfg.timezone
    ) {
      return cached.slots.map((s) => ({
        start: s.start,
        end: s.end,
        capacity: cfg.capacity,
        used: cfg.capacity - s.capacityLeft,
        left: s.capacityLeft,
        available: s.capacityLeft > 0,
      }));
    }

    const grid = await this.computeDailyGrid(tenant, dayISO);
    await this.cache.setAvailability(tenant.id, dayISO, {
      tenantId: tenant.id,
      date: dayISO,
      slots: grid.map((s) => ({ start: s.start, end: s.end, capacityLeft: s.left })),
      lastUpdated: new Date().toISOString(),
      capacity: cfg.capacity,
      slotSizeMinutes: cfg.slotSizeMinutes,
      avgDiningMinutes: cfg.avgDiningMinutes,
      turnoverMinutes: cfg.turnoverMinutes,
      timezone: cfg.timezone,
    });
    return grid;
  }

  async checkAvailability(
    input: AvailabilityCheckInput,
    tenant: Tenant,
  ): Promise<IntelligentAvailabilityResult> {
    const cfg = readAvailabilityConfig(tenant);
    const tz = cfg.timezone;
    const start = DateTime.fromJSDate(input.startAt, { zone: tz });
    const end = DateTime.fromJSDate(input.endAt, { zone: tz });
    const now = DateTime.now().setZone(tz);
    if (!(start < end) || input.people <= 0) {
      return { available: false, capacity: cfg.capacity, used: 0, left: cfg.capacity, reason: 'invalid' };
    }
    if (start < now) {
      return { available: false, capacity: cfg.capacity, used: 0, left: cfg.capacity, reason: 'past' };
    }

    const dayISO = formatYMD(input.startAt, tz);
    const grid = await this.getDailyAvailability(tenant, dayISO);
    if (grid.length === 0) {
      return { available: false, capacity: cfg.capacity, used: 0, left: cfg.capacity, reason: 'closed' };
    }

    const slotSize = cfg.slotSizeMinutes;
    const alignedStart = start.minus({
      minutes: start.minute % slotSize,
      seconds: start.second,
      milliseconds: start.millisecond,
    });
    const durationMin = end.diff(start, 'minutes').minutes;
    const { ok, left } = this.mergeSlotsToWindow(grid, alignedStart, durationMin, slotSize, tz);
    const used = cfg.capacity - left;
    if (ok && left >= input.people) {
      return { available: true, capacity: cfg.capacity, used, left };
    }

    const alternatives = this.suggestAlternatives(grid, start, durationMin, tz);
    return {
      available: false,
      capacity: cfg.capacity,
      used,
      left,
      reason: grid.length === 0 ? 'closed' : 'capacity',
      alternatives,
    } as IntelligentAvailabilityResult;
  }
}

