import type { Booking, Tenant } from '@prisma/client';

import { AvailabilityCache } from '@services/cache/availability-cache.js';
import { AvailabilityService } from '@services/booking/availability.service.js';
import { ValidationService } from '@services/booking/validation.service.js';

import { ConflictError } from '@core/errors/conflict.error.js';
import { NotFoundError } from '@core/errors/not-found.error.js';
import type { CreateBookingDTO, ModifyBookingDTO } from '@core/interfaces/booking.types.js';
import { BookingRepository } from '@core/repositories/booking.repo.js';
import { TenantRepository } from '@core/repositories/tenant.repo.js';

import { prisma } from '@infra/database/prisma.client.js';

import { pgAdvisoryXactLock } from '@utils/locks.js';
import { logger } from '@utils/logger.js';
import { incrementCounter } from '@utils/metrics.js';
import { formatYMD, toZonedDate, tzOfTenant } from '@utils/time.js';

export class BookingService {
  constructor(
    private readonly tenantRepo = new TenantRepository(),
    private readonly bookingRepo = new BookingRepository(),
    private readonly validationService = new ValidationService(),
    private readonly availabilityService = new AvailabilityService(),
    private readonly cache = new AvailabilityCache(),
  ) {}

  async createBooking(dto: CreateBookingDTO): Promise<Booking> {
    const tenant = await this.mustGetTenant(dto.tenantId);
    this.validationService.validateCreate(dto, tenant);

    const tz = tzOfTenant(tenant);
    const startAt = toZonedDate(dto.startAtISO, tz);
    const endAt = toZonedDate(dto.endAtISO, tz);
    const dayKey = formatYMD(startAt, tz);

      const avail = await this.availabilityService.checkAvailability(
        { tenantId: dto.tenantId, startAt, endAt, people: dto.people },
        tenant,
      );
      if (!avail.available) {
        const err = new ConflictError('Disponibilità insufficiente');
        // includi dettagli di disponibilità per il middleware d'errore
        (err as any).data = {
          reason: avail.reason ?? 'capacity',
          alternatives: avail.alternatives ?? [],
        };
        throw err;
      }

    const created = await (prisma as any).$transaction(async (tx: any) => {
      await pgAdvisoryXactLock(`avail:${dto.tenantId}:${dayKey}`);

        const again = await this.availabilityService.checkAvailability(
          { tenantId: dto.tenantId, startAt, endAt, people: dto.people },
          tenant,
        );
        if (!again.available) {
          const err = new ConflictError('Disponibilità insufficiente');
          // includi dettagli di disponibilità per il middleware d'errore
          (err as any).data = {
            reason: again.reason ?? 'capacity',
            alternatives: again.alternatives ?? [],
          };
          throw err;
        }

      const booking = await tx.booking.create({
        data: {
          tenantId: dto.tenantId,
          userPhone: dto.userPhone ?? null,
          name: dto.name,
          people: dto.people,
          startAt,
          endAt,
        },
      });

      return booking;
    });

    await this.cache.invalidateAvailabilityForDate(dto.tenantId, dayKey);
    incrementCounter('booking_created');
    logger.info('[booking] created', { tenantId: tenant.id, id: (created as Booking).id });
    return created as Booking;
  }

  async modifyBooking(dto: ModifyBookingDTO): Promise<Booking> {
    const tenant = await this.mustGetTenant(dto.tenantId);
    const existing = await this.bookingRepo.findById(dto.id, dto.tenantId);
    if (!existing) throw new NotFoundError('Prenotazione non trovata');

    const patch = dto.patch;
    this.validationService.validateModify({ ...dto, patch }, existing, tenant);

    const tz = tzOfTenant(tenant);
    const capacityChange =
      patch.people !== undefined || patch.startAtISO !== undefined || patch.endAtISO !== undefined;
    const startAt = capacityChange
      ? toZonedDate(patch.startAtISO ?? existing.startAt.toISOString(), tz)
      : existing.startAt;
    const endAt = capacityChange
      ? toZonedDate(patch.endAtISO ?? existing.endAt.toISOString(), tz)
      : existing.endAt;
    const oldDayKey = formatYMD(existing.startAt, tz);
    const newDayKey = formatYMD(startAt, tz);
    const people = capacityChange ? patch.people ?? existing.people : existing.people;

    if (capacityChange) {
      const avail = await this.availabilityService.checkAvailability(
        { tenantId: dto.tenantId, startAt, endAt, people, excludeId: existing.id },
        tenant,
      );
      let left = avail.left;
      if (
        existing.startAt.getTime() === startAt.getTime() &&
        existing.endAt.getTime() === endAt.getTime()
      ) {
        left += existing.people;
      }
        if (!avail.available || left < people) {
          const err = new ConflictError('Disponibilità insufficiente');
          // includi dettagli di disponibilità per il middleware d'errore
          (err as any).data = {
            reason: avail.reason ?? 'capacity',
            alternatives: avail.alternatives ?? [],
          };
          throw err;
        }
    }

    const updated = await (prisma as any).$transaction(async (tx: any) => {
      if (capacityChange) {
        await pgAdvisoryXactLock(`avail:${dto.tenantId}:${newDayKey}`);

        const again = await this.availabilityService.checkAvailability(
          { tenantId: dto.tenantId, startAt, endAt, people, excludeId: existing.id },
          tenant,
        );
        let againLeft = again.left;
        if (
          existing.startAt.getTime() === startAt.getTime() &&
          existing.endAt.getTime() === endAt.getTime()
        ) {
          againLeft += existing.people;
        }
          if (!again.available || againLeft < people) {
            const err = new ConflictError('Disponibilità insufficiente');
            // includi dettagli di disponibilità per il middleware d'errore
            (err as any).data = {
              reason: again.reason ?? 'capacity',
              alternatives: again.alternatives ?? [],
            };
            throw err;
          }
      }

      const patchDb: any = {};
      if (patch.name !== undefined) patchDb.name = patch.name;
      if (patch.people !== undefined) patchDb.people = patch.people;
      if (patch.startAtISO !== undefined) patchDb.startAt = startAt;
      if (patch.endAtISO !== undefined) patchDb.endAt = endAt;
      if (patch.status !== undefined) patchDb.status = patch.status;
      patchDb.version = { increment: 1 };

      const res = await tx.booking.updateMany({
        where: {
          id: dto.id,
          tenantId: dto.tenantId,
          version: dto.expectedVersion ?? existing.version,
        },
        data: patchDb,
      });
      if (res.count === 0) throw new ConflictError('Versione conflittuale');

      return tx.booking.findFirst({ where: { id: dto.id, tenantId: dto.tenantId } });
    });

    if (capacityChange) {
      await this.cache.invalidateAvailabilityForDate(tenant.id, oldDayKey);
      if (newDayKey !== oldDayKey) {
        await this.cache.invalidateAvailabilityForDate(tenant.id, newDayKey);
      }
    }

    incrementCounter('booking_modified');
    logger.info('[booking] modified', { tenantId: tenant.id, id: (updated as Booking).id });
    return updated as Booking;
  }

  async cancelBooking(id: string, tenantId: string): Promise<Booking> {
    const booking = await this.bookingRepo.findById(id, tenantId);
    if (!booking) throw new NotFoundError('Prenotazione non trovata');
    const tenant = await this.mustGetTenant(tenantId);
    const dayKey = formatYMD(booking.startAt, tzOfTenant(tenant));

    const updated = await this.bookingRepo.cancelById(id, tenantId);
    await this.cache.invalidateAvailabilityForDate(tenantId, dayKey);

    incrementCounter('booking_cancelled');
    logger.info('[booking] cancelled', { tenantId, id });
    return updated as Booking;
  }

  async getBookingsByUser(tenantId: string, userPhone: string) {
    return this.bookingRepo.findByUser(tenantId, userPhone);
  }

  async getBookingById(tenantId: string, id: string) {
    const booking = await this.bookingRepo.findById(id, tenantId);
    if (!booking) throw new NotFoundError('Prenotazione non trovata');
    return booking;
  }

  private async mustGetTenant(id: string): Promise<Tenant> {
    const tenant = await this.tenantRepo.findById(id);
    if (!tenant) throw new NotFoundError('Tenant non trovato');
    return tenant as Tenant;
  }
}
