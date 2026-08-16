import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { env } from "./env";

/**
 * Prisma 7 connects through a driver adapter rather than a Rust query engine.
 * The client is cached on globalThis so Next.js hot reloads in development do
 * not exhaust the Postgres connection pool.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createClient() {
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["warn", "error"]
        : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/**
 * Postgres error code raised when our reservations_no_overlap exclusion
 * constraint rejects a write — i.e. someone else took the slot first.
 */
export const EXCLUSION_VIOLATION = "23P01";

export function isSlotConflict(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: string }).code;
  if (code === EXCLUSION_VIOLATION) return true;
  // Prisma wraps driver errors; the original code survives in the message.
  const message = (error as { message?: string }).message ?? "";
  return (
    message.includes("reservations_no_overlap") ||
    message.includes(EXCLUSION_VIOLATION)
  );
}
