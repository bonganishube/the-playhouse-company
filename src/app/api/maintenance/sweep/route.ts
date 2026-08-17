import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { releaseExpiredHolds } from "@/lib/availability";
import { expireStalePayments, reconcileStalePayments } from "@/lib/booking";
import { resyncPendingCalendarEvents } from "@/lib/calendar/sync";
import { retryQueuedEmails } from "@/lib/email/mailer";
import { env } from "@/lib/env";
import { purgeExpiredResetTokens } from "@/lib/passwordReset";

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
 *   5. Re-attempt confirmations and receipts that failed to send, including
 *      any recorded while SMTP was unconfigured, so enabling the mail server
 *      delivers the backlog rather than losing it.
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
  // Spent and long-expired reset tokens serve no purpose and are a
  // standing liability if the database is ever exposed.
  const resetTokensPurged = await purgeExpiredResetTokens();

  // Leave the run enough room to answer before the platform kills it. Vercel's
  // Hobby plan stops a function at 60 seconds, Pro at 300, so the budget is
  // configurable rather than assumed; email is the only step long enough to
  // need it, and it stops on the clock and resumes next time.
  const budgetMs = Number(process.env.SWEEP_TIME_BUDGET_MS ?? 30_000);

  const [holdsReleased, bookingsExpired, calendarsSynced, mail] = await Promise.all([
    releaseExpiredHolds(),
    expireStalePayments(),
    resyncPendingCalendarEvents(),
    retryQueuedEmails(50, startedAt + budgetMs),
  ]);

  return NextResponse.json({
    ok: true,
    paymentsReconciled,
    holdsReleased,
    resetTokensPurged,
    bookingsExpired,
    calendarsSynced,
    emailsRetried: mail.attempted,
    emailsSent: mail.sent,
    emailsRemaining: mail.moreWaiting,
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
