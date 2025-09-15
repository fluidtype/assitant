import { prisma } from '@infra/database/prisma.client.js';

export class TenantRepository {
  async findById(id: string) {
    return (prisma as any).tenant.findUnique({ where: { id } });
  }
}
