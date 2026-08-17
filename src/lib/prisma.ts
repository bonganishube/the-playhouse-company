import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "@/generated/prisma/client";
import { env } from "./env";

/**
 * Prisma 7 connects through a driver adapter rather than a Rust query engine.
 * The client is cached on globalThis so Next.js hot reloads in development do
 * not exhaust the Postgres connection pool.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createClient> | undefined;
};

/**
 * Operations that may safely be run a second time.
 *
 * Reads only, deliberately. A write that failed on a broken connection may
 * still have committed before the socket died, with only the acknowledgement
 * lost. Retrying one of those could issue a second booking reference or a
 * second payment, so writes are left to fail visibly and be retried by a
 * person who can see what happened.
 */
const RETRYABLE_OPERATIONS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
]);

/**
 * Is this a lost connection rather than a rejected query?
 *
 * Matched narrowly. Treating an ordinary constraint violation as retryable
 * would hide real failures, so anything not recognisably about the transport
 * is left alone.
 */
function isConnectionError(error: unknown): boolean {
  const codes: string[] = [];
  const messages: string[] = [];

  for (let e: unknown = error, depth = 0; e && depth < 5; depth++) {
    const o = e as { code?: unknown; message?: unknown; cause?: unknown };
    if (typeof o.code === "string") codes.push(o.code);
    if (typeof o.message === "string") messages.push(o.message.toLowerCase());
    e = o.cause;
  }

  // Prisma's own connection codes, then the driver's socket errors.
  if (
    codes.some((c) =>
      ["P1000", "P1001", "P1002", "P1008", "P1017", "P2024"].includes(c) ||
      ["ECONNRESET", "ECONNREFUSED", "EPIPE", "ETIMEDOUT", "ENOTFOUND"].includes(c),
    )
  ) {
    return true;
  }

  return messages.some(
    (m) =>
      m.includes("connection terminated") ||
      m.includes("connection closed") ||
      m.includes("server has closed the connection") ||
      m.includes("connection is closed") ||
      m.includes("timeout exceeded when trying to connect") ||
      m.includes("socket hang up"),
  );
}

/**
 * Report what actually went wrong.
 *
 * Prisma surfaces a driver-level failure as a PrismaClientKnownRequestError
 * whose message is the offending call and nothing else, so the console shows a
 * query and no reason. The cause chain holds the real error, and printing it
 * is the difference between "the database is unreachable" and three rounds of
 * guesswork.
 */
function describeCause(error: unknown): string {
  const parts: string[] = [];
  for (let e: unknown = error, depth = 0; e && depth < 5; depth++) {
    const o = e as { name?: unknown; code?: unknown; message?: unknown; cause?: unknown };
    const bit = [o.name, o.code, o.message].filter(Boolean).join(" ");
    if (bit && !parts.includes(bit)) parts.push(bit);
    e = o.cause;
  }
  return parts.join(" <- ") || "no cause recorded";
}

/**
 * Idle connections are retired well before the database drops them.
 *
 * Neon suspends a project's compute after a few minutes without traffic, and
 * the TCP connections go with it. A pool that keeps them open then hands out
 * sockets the server has already closed, and because the dead ones are never
 * replaced every subsequent query fails, instantly and permanently, until the
 * process restarts. That is what turned an idle laptop into a site returning
 * 500 on every page.
 *
 * Thirty seconds is comfortably inside any provider's idle cut-off, so the
 * pool always closes a connection before the far end does. The cost is an
 * occasional reconnect on the first request after a quiet spell.
 */
const IDLE_TIMEOUT_MS = 30_000;

/**
 * How long to keep trying a read whose connection was refused or lost.
 *
 * A suspended Neon compute refuses connections outright while it starts, and
 * starting takes seconds, not milliseconds. A single quick retry was therefore
 * no use at all: it failed for exactly the same reason as the first attempt
 * and the page still broke. These delays are chosen to span a cold start, so
 * the first request after a quiet period is merely slow rather than an error.
 */
const READ_RETRY_DELAYS_MS = [400, 1_500, 4_000];

async function retryRead(
  model: string | undefined,
  operation: string,
  args: unknown,
  query: (args: unknown) => Promise<unknown>,
  firstError: unknown,
): Promise<unknown> {
  let lastError = firstError;

  for (const [attempt, delay] of READ_RETRY_DELAYS_MS.entries()) {
    await new Promise((resolve) => setTimeout(resolve, delay));
    console.warn(
      `[prisma] retrying ${model ?? "raw"}.${operation} ` +
        `(attempt ${attempt + 2} of ${READ_RETRY_DELAYS_MS.length + 1})`,
    );
    try {
      return await query(args);
    } catch (error) {
      lastError = error;
      if (!isConnectionError(error)) throw error;
    }
  }

  console.error(
    `[prisma] ${model ?? "raw"}.${operation} still failing after ` +
      `${READ_RETRY_DELAYS_MS.length + 1} attempts: ${describeCause(lastError)}`,
  );
  throw lastError;
}

function createClient() {
  // Which server this process will actually talk to, printed once at startup.
  // A connection refused instantly is almost always the wrong URL rather than
  // a database that is down, and the fastest way to tell the two apart is to
  // see the host. Credentials are never included.
  try {
    const target = new URL(env.DATABASE_URL);
    console.info(
      `[prisma] connecting to ${target.hostname}:${target.port || 5432}${target.pathname}`,
    );
  } catch {
    console.error("[prisma] DATABASE_URL is not a valid connection string");
  }

  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    idleTimeoutMillis: IDLE_TIMEOUT_MS,
    // Waking suspended compute takes a few seconds; failing sooner than that
    // would turn a cold start into an error.
    connectionTimeoutMillis: 15_000,
    max: 10,
  });

  // Postgres closing an idle connection surfaces as an 'error' on the pool.
  // Node treats an unhandled 'error' event as fatal, so this listener is what
  // keeps a dropped idle connection from taking the server down with it.
  pool.on("error", (error) => {
    console.warn(`[prisma] idle connection dropped: ${error.message}`);
  });

  const client = new PrismaClient({
    adapter: new PrismaPg(pool),
    log:
      process.env.NODE_ENV === "development"
        ? ["warn", "error"]
        : ["error"],
  });

  return client.$extends({
    query: {
      async $allOperations({ model, operation, args, query }) {
        try {
          return await query(args);
        } catch (error) {
          const connection = isConnectionError(error);
          console.error(
            `[prisma] ${model ?? "raw"}.${operation} failed` +
              `${connection ? " (connection lost)" : ""}: ${describeCause(error)}`,
          );

          if (!connection || !RETRYABLE_OPERATIONS.has(operation)) throw error;
          return retryRead(model, operation, args, query, error);
        }
      },
    },
  });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/**
 * Postgres error code raised when our reservations_no_overlap exclusion
 * constraint rejects a write, i.e. someone else took the slot first.
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
