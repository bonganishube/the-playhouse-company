"use server";

import { toCents } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { formatRange } from "@/lib/time";

/**
 * Booking lookup for customers who are not signed in.
 *
 * Requires both the booking reference and the email address it was made
 * under, and returns only a read-only summary, it never establishes a
 * session, so knowing a reference cannot be used to take over an account.
 */

export type BookingSummary = {
  reference: string;
  status: string;
  contactName: string;
  eventTitle: string | null;
  lines: { venue: string; when: string; amount: number }[];
  totalCents: number;
  paidCents: number;
  outstandingCents: number;
  currency: string;
  createdAt: string;
};

export type LookupState = {
  ok: boolean;
  message?: string;
  booking?: BookingSummary;
};

export async function lookupBookingAction(
  _prev: LookupState,
  formData: FormData,
): Promise<LookupState> {
  const reference = String(formData.get("reference") ?? "").trim().toUpperCase();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (!reference || !email) {
    return { ok: false, message: "Enter both your booking reference and email address." };
  }

  const booking = await prisma.booking.findUnique({
    where: { reference },
    include: {
      reservations: {
        include: { venue: { select: { name: true, timezone: true } } },
        orderBy: { startsAt: "asc" },
      },
    },
  });

  // A single message whether the reference is unknown or the email does not
  // match, so the form cannot be used to confirm that a reference exists.
  if (!booking || booking.contactEmail.toLowerCase() !== email) {
    return {
      ok: false,
      message: "No booking was found for that reference and email address.",
    };
  }

  return {
    ok: true,
    booking: {
      reference: booking.reference,
      status: booking.status,
      contactName: booking.contactName,
      eventTitle: booking.eventTitle,
      lines: booking.reservations.map((r) => ({
        venue: r.venue.name,
        when: formatRange(r.startsAt, r.endsAt, r.venue.timezone),
        amount: toCents(r.lineTotal),
      })),
      totalCents: toCents(booking.total),
      paidCents: toCents(booking.amountPaid),
      outstandingCents: toCents(booking.total) - toCents(booking.amountPaid),
      currency: booking.currency,
      createdAt: booking.createdAt.toISOString(),
    },
  };
}
