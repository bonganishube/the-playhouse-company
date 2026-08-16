import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { releaseExpiredHolds } from "@/lib/availability";
import { expireStalePayments, reconcileStalePayments } from "@/lib/booking";
import { resyncPendingCalendarEvents } from "@/lib/calendar/sync";
import { env } from "@/lib/env";

/**
 * Scheduled maintenance. Intended to run every few minutes from the platform
 * scheduler (Vercel Cron, Azure Scheduler, or a system cron calling this URL).
 *
 *   1. Reconcile in-flight payments against the gateway, so a lost webhook
 *      cannot leave a paid booking unconfirmed.
 *   2. Release cart holds whose lifetime has lapsed.
 *   3. Cancel bookings that were never paid for within the payment window.
 *   4. Retry Outlook synchronisation for confirmed bookings that have no event,
 *      recovering automatically from a Microsoft Graph outage.
 *
 * Availability reads also release lapsed holds opportunistically, so a missed
 * run degrades gracefully rather than blocking bookings.
 */
export async function POST(request: Request) {
  if (!authorised(request)) {
    return NextResponse.json({ error: "Not permitted" }, { status: 401 });
  }

  const startedAt = Date.now();

  // Reconciliation runs first: a payment that actually succeeded must be
  // applied before the expiry sweep could otherwise cancel its booking.
  const paymentsReconciled = await reconcileStalePayments();

  const [holdsReleased, bookingsExpired, calendarsSynced] = await Promise.all([
    releaseExpiredHolds(),
    expireStalePayments(),
    resyncPendingCalendarEvents(),
  ]);

  return NextResponse.json({
    ok: true,
    paymentsReconciled,
    holdsReleased,
    bookingsExpired,
    calendarsSynced,
    durationMs: Date.now() - startedAt,
  });
}

/** Some schedulers issue GET; behave identically. */
export async function GET(request: Request) {
  return POST(request);
}

function authorised(request: Request): boolean {
  if (!env.CRON_SECRET) return false;

  const header =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    new URL(request.url).searchParams.get("secret") ??
    "";

  const provided = Buffer.from(header);
  const expected = Buffer.from(env.CRON_SECRET);
  return (
    provided.length === expected.length && timingSafeEqual(provided, expected)
  );
}
