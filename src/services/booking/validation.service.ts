import { DateTime } from 'luxon';
import type { Booking, Tenant } from '@prisma/client';

import { ValidationError } from '@core/errors/validation.error.js';
import type { CreateBookingDTO, ModifyBookingDTO } from '@core/interfaces/booking.types.js';

import { tzOfTenant, toZonedDate } from '@utils/time.js';

function hmToMinutes(hm: string): number {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
}

function rangesForDay(tenant: Tenant, dayKey: string): Array<{ start: number; end: number }> {
  const opening = (tenant.config as any)?.openingHours;
  const ranges: string[] = opening?.[dayKey] ?? [];
  return ranges.map((r) => {
    const [s, e] = r.split('-');
    return { start: hmToMinutes(s), end: hmToMinutes(e) };
  });
}

function isWithinOpeningHours(startAt: Date, endAt: Date, tenant: Tenant, tz: string): boolean {
  const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const startLocal = DateTime.fromJSDate(startAt).setZone(tz);
  const endLocal = DateTime.fromJSDate(endAt).setZone(tz);
  if (startLocal.toISODate() !== endLocal.toISODate()) return false;

  const dayKey = days[startLocal.weekday % 7];
  const ranges = rangesForDay(tenant, dayKey);
  if (!ranges.length) return false;

  const startMin = startLocal.hour * 60 + startLocal.minute;
  const endMin = endLocal.hour * 60 + endLocal.minute;
  return ranges.some((r) => startMin >= r.start && endMin <= r.end);
}

export class ValidationService {
  private readonly defaultMaxPeople = 8;
  private readonly defaultMinAdvance = 60; // minutes
  private readonly defaultMaxDuration = 120; // minutes

  validateCreate(dto: CreateBookingDTO, tenant: Tenant): void {
    this.validateCommon(
      {
        name: dto.name,
        people: dto.people,
        startAtISO: dto.startAtISO,
        endAtISO: dto.endAtISO,
      },
      tenant,
    );
  }

  validateModify(
    input: ModifyBookingDTO & { patch: any },
    existing: Booking,
    tenant: Tenant,
  ): void {
    const merged = {
      name: input.patch.name ?? existing.name,
      people: input.patch.people ?? existing.people,
      startAtISO: input.patch.startAtISO ?? existing.startAt.toISOString(),
      endAtISO: input.patch.endAtISO ?? existing.endAt.toISOString(),
    };
    this.validateCommon(merged, tenant);
  }

  private validateCommon(
    data: {
      name: string;
      people: number;
      startAtISO: string;
      endAtISO: string;
    },
    tenant: Tenant,
  ): void {
    const name = data.name?.trim();
    if (!name) throw new ValidationError('Il nome è obbligatorio');

    const maxPeople = (tenant.config as any)?.rules?.maxPeople ?? this.defaultMaxPeople;
    if (!Number.isInteger(data.people) || data.people < 1 || data.people > maxPeople) {
      throw new ValidationError(`Numero di persone non valido (max ${maxPeople})`);
    }

    const tz = tzOfTenant(tenant);
    const startAt = toZonedDate(data.startAtISO, tz);
    const endAt = toZonedDate(data.endAtISO, tz);
    if (!(startAt < endAt)) {
      throw new ValidationError("L'orario iniziale deve precedere quello finale");
    }

    const now = new Date();
    const minAdvance = (tenant.config as any)?.rules?.minAdvanceMinutes ?? this.defaultMinAdvance;
    const minDate = new Date(now.getTime() + minAdvance * 60000);
    if (startAt < minDate) {
      throw new ValidationError("L'orario richiesto è troppo vicino o nel passato");
    }

    const maxDuration =
      (tenant.config as any)?.rules?.maxDurationMinutes ?? this.defaultMaxDuration;
    const durationMinutes = (endAt.getTime() - startAt.getTime()) / 60000;
    if (durationMinutes > maxDuration) {
      throw new ValidationError('La durata richiesta supera il limite consentito');
    }

    if (!isWithinOpeningHours(startAt, endAt, tenant, tz)) {
      throw new ValidationError('L’orario richiesto è fuori dagli orari di apertura');
    }
  }
}
