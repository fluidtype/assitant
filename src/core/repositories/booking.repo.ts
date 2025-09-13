import type { BookingStatus } from '@core/interfaces/booking.types.js';

import { prisma } from '@infra/database/prisma.client.js';

export class BookingRepository {
  async create(data: {
    tenantId: string;
    userPhone?: string | null;
    name: string;
    people: number;
    startAt: Date;
    endAt: Date;
    status?: BookingStatus;
  }) {
    return (prisma as any).booking.create({
      data: { ...data, status: data.status ?? 'confirmed' },
    });
  }

  async updateByIdOptimistic(
    id: string,
    tenantId: string,
    patch: Partial<{
      name: string;
      people: number;
      startAt: Date;
      endAt: Date;
      status: BookingStatus;
    }>,
    expectedVersion?: number,
  ) {
    if (expectedVersion === undefined) {
      return (prisma as any).booking.update({
        where: { id },
        data: { ...patch, version: { increment: 1 } },
      });
    }
    return (prisma as any).booking.updateMany({
      where: { id, tenantId, version: expectedVersion },
      data: { ...patch, version: { increment: 1 } },
    });
  }

  async findById(id: string, tenantId: string) {
    return (prisma as any).booking.findFirst({ where: { id, tenantId } });
  }

  async findByUser(tenantId: string, userPhone: string) {
    return (prisma as any).booking.findMany({
      where: { tenantId, userPhone },
      orderBy: { startAt: 'desc' },
    });
  }

  async findOverlapping(tenantId: string, startAt: Date, endAt: Date) {
    return (prisma as any).booking.findMany({
      where: {
        tenantId,
        status: 'confirmed',
        startAt: { lt: endAt },
        endAt: { gt: startAt },
      },
      select: { id: true, people: true, startAt: true, endAt: true },
    });
  }

  async cancelById(id: string, tenantId: string) {
    return (prisma as any).booking.update({
      where: { id },
      data: { status: 'cancelled', version: { increment: 1 } },
    });
  }
}
