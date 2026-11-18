import { PrismaClient } from "@prisma/client";

export const prisma = globalThis.billfoldPrisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalThis.billfoldPrisma = prisma;

export function exclusive(work) {
  return prisma.$transaction(
    async (tx) => {
      // Billing and workshop conversions share the same invoice allocator.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(645391724)`;
      return work(tx);
    },
    { maxWait: 10000, timeout: 30000 },
  );
}
