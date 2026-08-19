import { NextResponse } from "next/server";
import { reconcileBookingPayments } from "@/lib/booking";
import { getSession, isStaffRole } from "@/lib/auth";
import { OUTCOME_TOKEN_PARAM, tokenMatchesAnyPayment } from "@/lib/paymentAccess";
import { prisma } from "@/lib/prisma";

/**
 * Confirm a booking whose payment succeeded but whose webhook has not arrived.
 *
 * Triggered by the customer's own booking page when they return from the
 * payment provider. Restricted to the booking's owner (or staff) so it cannot
 * be used to probe the state of other people's bookings.
 *
 * The latest attempt's own status is reported alongside the booking's, because
 * the two answer different questions. A declined card leaves the booking at
 * PENDING_PAYMENT exactly as an undelivered webhook does, and the customer
 * asking "did my payment go through?" is owed a straight answer rather than an
 * indefinite "still confirming".
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ reference: string }> },
) {
  const { reference } = await params;

  const booking = await prisma.booking.findUnique({
    where: { reference },
    select: {
      id: true,
      userId: true,
      status: true,
      payments: { select: { reference: true } },
    },
  });
  if (!booking) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const session = await getSession();
  // The proof carried in the return URL authorises this poll as well as the
  // page that makes it. A customer with no session is exactly the one whose
  // payment is still unresolved on screen.
  const presented =
    new URL(request.url).searchParams.get(OUTCOME_TOKEN_PARAM) ?? undefined;
  const permitted =
    (session && (session.id === booking.userId || isStaffRole(session.role))) ||
    tokenMatchesAnyPayment(
      presented,
      booking.payments.map((p) => p.reference),
    );
  if (!permitted) {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  // Nothing in flight, the webhook already did its work.
  if (booking.status !== "PENDING_PAYMENT") {
    return NextResponse.json({
      status: booking.status,
      payment: await latestPayment(booking.id),
      reconciled: false,
      changed: false,
    });
  }

  const outcomes = await reconcileBookingPayments(booking.id);

  const updated = await prisma.booking.findUniqueOrThrow({
    where: { id: booking.id },
    select: { status: true },
  });

  return NextResponse.json({
    status: updated.status,
    payment: await latestPayment(booking.id),
    reconciled: outcomes.some((o) => o.handled),
    changed: updated.status !== booking.status,
  });
}

/** The attempt the customer has just come back from, if there is one. */
async function latestPayment(bookingId: string) {
  const payment = await prisma.payment.findFirst({
    where: { bookingId },
    orderBy: { createdAt: "desc" },
    select: { status: true, failureReason: true },
  });
  if (!payment) return null;
  return { status: payment.status, failureReason: payment.failureReason };
}
