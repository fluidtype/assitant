declare module '@prisma/client' {
  // minimal stubs for offline type checking
  export class PrismaClient {
    constructor(...args: any[]);
  }
  export interface Tenant {
    timezone: string;
  }
}
