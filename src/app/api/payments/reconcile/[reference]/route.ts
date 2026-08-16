import { NextResponse } from "next/server";
import { reconcileBookingPayments } from "@/lib/booking";
import { getSession, isStaffRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Confirm a booking whose payment succeeded but whose webhook has not arrived.
 *
 * Triggered by the customer's own booking page when they return from the
 * payment provider. Restricted to the booking's owner (or staff) so it cannot
 * be used to probe the state of other people's bookings.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ reference: string }> },
) {
  const { reference } = await params;

  const booking = await prisma.booking.findUnique({
    where: { reference },
    select: { id: true, userId: true, status: true },
  });
  if (!booking) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const session = await getSession();
  const permitted =
    session && (session.id === booking.userId || isStaffRole(session.role));
  if (!permitted) {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  // Nothing in flight, the webhook already did its work.
  if (booking.status !== "PENDING_PAYMENT") {
    return NextResponse.json({ status: booking.status, reconciled: false });
  }

  const outcomes = await reconcileBookingPayments(booking.id);

  const updated = await prisma.booking.findUniqueOrThrow({
    where: { id: booking.id },
    select: { status: true },
  });

  return NextResponse.json({
    status: updated.status,
    reconciled: outcomes.some((o) => o.handled),
    changed: updated.status !== booking.status,
  });
}
