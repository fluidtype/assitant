declare module '@prisma/client' {
  // minimal stubs for offline type checking
  export class PrismaClient {
    constructor(...args: any[]);
  }
  export interface Tenant {
    id: string;
    name: string;
    timezone: string;
    config?: Record<string, any> | null;
  }
  export interface Booking {
    id: string;
    tenantId: string;
    userPhone: string | null;
    name: string;
    people: number;
    startAt: Date;
    endAt: Date;
    status: string;
  }
  export namespace Prisma {}
}
