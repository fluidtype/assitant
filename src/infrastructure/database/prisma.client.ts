import { PrismaClient } from '@prisma/client';
import type { Prisma } from '@prisma/client';

declare global {
  var __PRISMA_CLIENT__: PrismaClient | undefined;
}

const isProd = process.env.NODE_ENV === 'production';

export const prisma: PrismaClient =
  global.__PRISMA_CLIENT__ ??
  new PrismaClient({
    log: isProd ? ['error', 'warn'] : ['error', 'warn'],
  });

if (!isProd) {
  global.__PRISMA_CLIENT__ = prisma;
}

export type { Prisma };
