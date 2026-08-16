import { randomBytes } from "node:crypto";
import { prisma } from "./prisma";
import { DateTime } from "./time";

/**
 * Human-quotable identifiers, drawn from Postgres sequences so they remain
 * unique and monotonic even when several checkouts complete simultaneously.
 */

type Client = { $queryRawUnsafe: (sql: string) => Promise<unknown> };

async function nextval(
  sequence: string,
  client: Client = prisma as unknown as Client,
): Promise<number> {
  const rows = (await client.$queryRawUnsafe(
    `SELECT nextval('${sequence}') AS value`,
  )) as { value: bigint | number }[];
  return Number(rows[0]!.value);
}

/** e.g. PHC-2026-000431 */
export async function nextBookingReference(client?: Client): Promise<string> {
  const value = await nextval("booking_reference_seq", client);
  const year = DateTime.now().setZone("Africa/Johannesburg").year;
  return `PHC-${year}-${String(value).padStart(6, "0")}`;
}

/** e.g. RCT-2026-000117 */
export async function nextReceiptNumber(client?: Client): Promise<string> {
  const value = await nextval("receipt_number_seq", client);
  const year = DateTime.now().setZone("Africa/Johannesburg").year;
  return `RCT-${year}-${String(value).padStart(6, "0")}`;
}

/**
 * Opaque reference sent to a payment gateway. Includes the booking reference
 * for reconciliation against merchant statements, plus entropy so a retried
 * payment on the same booking never reuses an identifier.
 */
export function paymentReference(bookingReference: string): string {
  return `${bookingReference}-${randomBytes(4).toString("hex").toUpperCase()}`;
}

/** Unguessable identifier for anonymous cart sessions. */
export function newSessionId(): string {
  return randomBytes(24).toString("base64url");
}
