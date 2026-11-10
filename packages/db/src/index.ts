import { PrismaClient } from '@prisma/client';

export * from '@prisma/client';

const g = globalThis as unknown as { __haulPrisma?: PrismaClient };
export const prisma = g.__haulPrisma ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') g.__haulPrisma = prisma;
