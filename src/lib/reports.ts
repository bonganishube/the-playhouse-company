import {
  BookingStatus,
  PaymentStatus,
  ReservationStatus,
} from "@/generated/prisma/enums";
import { toCents } from "./money";
import { prisma } from "./prisma";
import { minutesBetween } from "./time";

/**
 * Reporting.
 *
 * Each report is a plain async function returning rows plus a totals summary,
 * so the same result feeds the on-screen table and the CSV export without
 * being computed twice.
 *
 * Revenue is recognised from settled payments (PaymentStatus.SUCCEEDED), not
 * from booking totals, so figures reconcile against the merchant statement
 * rather than against what was invoiced.
 */

export type DateRange = { from: Date; to: Date };

/** Statuses that represent a booking that actually stands. */
const LIVE_BOOKINGS = [
  BookingStatus.CONFIRMED,
  BookingStatus.PENDING_APPROVAL,
  BookingStatus.PENDING_PAYMENT,
  BookingStatus.COMPLETED,
];

// ---------------------------------------------------------------------------
// 1. Bookings by venue
// ---------------------------------------------------------------------------

export type BookingsByVenueRow = {
  venueId: string;
  venueName: string;
  bookings: number;
  hoursBooked: number;
  valueCents: number;
};

export async function bookingsByVenue(
  range: DateRange,
): Promise<{ rows: BookingsByVenueRow[]; totals: Omit<BookingsByVenueRow, "venueId" | "venueName"> }> {
  const reservations = await prisma.reservation.findMany({
    where: {
      startsAt: { gte: range.from, lt: range.to },
      status: {
        in: [ReservationStatus.CONFIRMED, ReservationStatus.PENDING_APPROVAL, ReservationStatus.PENDING_PAYMENT],
      },
      booking: { is: { status: { in: LIVE_BOOKINGS } } },
    },
    include: { venue: { select: { id: true, name: true } } },
  });

  const byVenue = new Map<string, BookingsByVenueRow>();
  const bookingIdsPerVenue = new Map<string, Set<string>>();

  for (const r of reservations) {
    const row = byVenue.get(r.venueId) ?? {
      venueId: r.venueId,
      venueName: r.venue.name,
      bookings: 0,
      hoursBooked: 0,
      valueCents: 0,
    };
    row.hoursBooked += minutesBetween(r.startsAt, r.endsAt) / 60;
    row.valueCents += toCents(r.lineTotal);
    byVenue.set(r.venueId, row);

    // A booking spanning several slots at one venue counts once.
    const seen = bookingIdsPerVenue.get(r.venueId) ?? new Set<string>();
    if (r.bookingId) seen.add(r.bookingId);
    bookingIdsPerVenue.set(r.venueId, seen);
  }

  const rows = [...byVenue.values()].map((row) => ({
    ...row,
    bookings: bookingIdsPerVenue.get(row.venueId)?.size ?? 0,
    hoursBooked: round2(row.hoursBooked),
  }));
  rows.sort((a, b) => b.valueCents - a.valueCents);

  return {
    rows,
    totals: {
      bookings: rows.reduce((s, r) => s + r.bookings, 0),
      hoursBooked: round2(rows.reduce((s, r) => s + r.hoursBooked, 0)),
      valueCents: rows.reduce((s, r) => s + r.valueCents, 0),
    },
  };
}

// ---------------------------------------------------------------------------
// 2. Revenue by venue
// ---------------------------------------------------------------------------

export type RevenueByVenueRow = {
  venueId: string;
  venueName: string;
  /** Value of bookings raised in the period. */
  invoicedCents: number;
  /** Cash actually settled in the period, apportioned across the booking. */
  collectedCents: number;
  outstandingCents: number;
};

export async function revenueByVenue(
  range: DateRange,
): Promise<{ rows: RevenueByVenueRow[]; totals: Omit<RevenueByVenueRow, "venueId" | "venueName"> }> {
  const bookings = await prisma.booking.findMany({
    where: {
      createdAt: { gte: range.from, lt: range.to },
      status: { in: LIVE_BOOKINGS },
    },
    include: {
      reservations: { include: { venue: { select: { id: true, name: true } } } },
    },
  });

  const byVenue = new Map<string, RevenueByVenueRow>();

  for (const booking of bookings) {
    const bookingTotal = toCents(booking.total);
    const bookingPaid = toCents(booking.amountPaid);
    if (bookingTotal === 0) continue;

    for (const r of booking.reservations) {
      const lineCents = toCents(r.lineTotal);
      // Payments are made against a booking, not a line, so cash is
      // apportioned across venues in proportion to each line's value.
      const share = lineCents / bookingTotal;

      const row = byVenue.get(r.venueId) ?? {
        venueId: r.venueId,
        venueName: r.venue.name,
        invoicedCents: 0,
        collectedCents: 0,
        outstandingCents: 0,
      };
      row.invoicedCents += lineCents;
      row.collectedCents += Math.round(bookingPaid * share);
      byVenue.set(r.venueId, row);
    }
  }

  const rows = [...byVenue.values()].map((row) => ({
    ...row,
    outstandingCents: Math.max(0, row.invoicedCents - row.collectedCents),
  }));
  rows.sort((a, b) => b.invoicedCents - a.invoicedCents);

  return {
    rows,
    totals: {
      invoicedCents: rows.reduce((s, r) => s + r.invoicedCents, 0),
      collectedCents: rows.reduce((s, r) => s + r.collectedCents, 0),
      outstandingCents: rows.reduce((s, r) => s + r.outstandingCents, 0),
    },
  };
}

// ---------------------------------------------------------------------------
// 3. Customer booking history
// ---------------------------------------------------------------------------

export type CustomerHistoryRow = {
  bookingId: string;
  reference: string;
  createdAt: Date;
  status: BookingStatus;
  customerName: string;
  customerEmail: string;
  organisation: string | null;
  venues: string;
  firstStartsAt: Date | null;
  totalCents: number;
  paidCents: number;
};

export async function customerHistory(
  range: DateRange,
  filter: { email?: string; userId?: string } = {},
): Promise<{ rows: CustomerHistoryRow[]; totals: { bookings: number; totalCents: number; paidCents: number } }> {
  const bookings = await prisma.booking.findMany({
    where: {
      createdAt: { gte: range.from, lt: range.to },
      ...(filter.userId ? { userId: filter.userId } : {}),
      ...(filter.email
        ? { contactEmail: { contains: filter.email, mode: "insensitive" as const } }
        : {}),
    },
    include: {
      reservations: {
        include: { venue: { select: { name: true } } },
        orderBy: { startsAt: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const rows: CustomerHistoryRow[] = bookings.map((b) => ({
    bookingId: b.id,
    reference: b.reference,
    createdAt: b.createdAt,
    status: b.status,
    customerName: b.contactName,
    customerEmail: b.contactEmail,
    organisation: b.organisation,
    venues: [...new Set(b.reservations.map((r) => r.venue.name))].join(", "),
    firstStartsAt: b.reservations[0]?.startsAt ?? null,
    totalCents: toCents(b.total),
    paidCents: toCents(b.amountPaid),
  }));

  return {
    rows,
    totals: {
      bookings: rows.length,
      totalCents: rows.reduce((s, r) => s + r.totalCents, 0),
      paidCents: rows.reduce((s, r) => s + r.paidCents, 0),
    },
  };
}

// ---------------------------------------------------------------------------
// 4. Cancelled bookings
// ---------------------------------------------------------------------------

export type CancelledBookingRow = {
  bookingId: string;
  reference: string;
  status: BookingStatus;
  customerName: string;
  venues: string;
  bookedFor: Date | null;
  cancelledAt: Date | null;
  reason: string | null;
  valueCents: number;
  refundDueCents: number;
};

export async function cancelledBookings(
  range: DateRange,
): Promise<{ rows: CancelledBookingRow[]; totals: { count: number; valueCents: number; refundDueCents: number } }> {
  const bookings = await prisma.booking.findMany({
    where: {
      status: { in: [BookingStatus.CANCELLED, BookingStatus.REJECTED] },
      OR: [
        { cancelledAt: { gte: range.from, lt: range.to } },
        { rejectedAt: { gte: range.from, lt: range.to } },
      ],
    },
    include: {
      reservations: {
        include: { venue: { select: { name: true } } },
        orderBy: { startsAt: "asc" },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  const rows: CancelledBookingRow[] = bookings.map((b) => ({
    bookingId: b.id,
    reference: b.reference,
    status: b.status,
    customerName: b.contactName,
    venues: [...new Set(b.reservations.map((r) => r.venue.name))].join(", "),
    bookedFor: b.reservations[0]?.startsAt ?? null,
    cancelledAt: b.cancelledAt ?? b.rejectedAt,
    reason: b.cancellationReason ?? b.rejectionReason,
    valueCents: toCents(b.total),
    // Money taken on a booking that will not proceed is refundable.
    refundDueCents: toCents(b.amountPaid),
  }));

  return {
    rows,
    totals: {
      count: rows.length,
      valueCents: rows.reduce((s, r) => s + r.valueCents, 0),
      refundDueCents: rows.reduce((s, r) => s + r.refundDueCents, 0),
    },
  };
}

// ---------------------------------------------------------------------------
// 5. Outstanding payments
// ---------------------------------------------------------------------------

export type OutstandingPaymentRow = {
  bookingId: string;
  reference: string;
  status: BookingStatus;
  customerName: string;
  customerEmail: string;
  venues: string;
  bookedFor: Date | null;
  totalCents: number;
  paidCents: number;
  outstandingCents: number;
  /** Days until (negative) or since (positive) the booking date. */
  daysToEvent: number | null;
  isDeposit: boolean;
};

export async function outstandingPayments(): Promise<{
  rows: OutstandingPaymentRow[];
  totals: { count: number; outstandingCents: number };
}> {
  const bookings = await prisma.booking.findMany({
    where: { status: { in: LIVE_BOOKINGS } },
    include: {
      reservations: {
        include: { venue: { select: { name: true } } },
        orderBy: { startsAt: "asc" },
      },
    },
  });

  const now = Date.now();
  const rows: OutstandingPaymentRow[] = [];

  for (const b of bookings) {
    // Measured against the full booking value, so a deposit-paid booking still
    // shows its balance as outstanding.
    const outstanding = toCents(b.total) - toCents(b.amountPaid);
    if (outstanding <= 0) continue;

    const bookedFor = b.reservations[0]?.startsAt ?? null;
    rows.push({
      bookingId: b.id,
      reference: b.reference,
      status: b.status,
      customerName: b.contactName,
      customerEmail: b.contactEmail,
      venues: [...new Set(b.reservations.map((r) => r.venue.name))].join(", "),
      bookedFor,
      totalCents: toCents(b.total),
      paidCents: toCents(b.amountPaid),
      outstandingCents: outstanding,
      daysToEvent: bookedFor
        ? Math.round((bookedFor.getTime() - now) / 86_400_000)
        : null,
      isDeposit: b.paymentPolicy === "DEPOSIT_ALLOWED",
    });
  }

  // Most urgent first — the soonest events with money still owing.
  rows.sort((a, b) => (a.daysToEvent ?? 1e9) - (b.daysToEvent ?? 1e9));

  return {
    rows,
    totals: {
      count: rows.length,
      outstandingCents: rows.reduce((s, r) => s + r.outstandingCents, 0),
    },
  };
}

// ---------------------------------------------------------------------------
// 6. Venue utilisation
// ---------------------------------------------------------------------------

export type UtilisationRow = {
  venueId: string;
  venueName: string;
  /** Hours the venue was open for hire in the period. */
  availableHours: number;
  bookedHours: number;
  utilisationPercent: number;
  bookings: number;
  revenueCents: number;
};

export async function venueUtilisation(
  range: DateRange,
): Promise<{ rows: UtilisationRow[]; totals: { availableHours: number; bookedHours: number; utilisationPercent: number } }> {
  const venues = await prisma.venue.findMany({
    where: { isActive: true },
    include: { operatingHours: true },
  });

  const reservations = await prisma.reservation.findMany({
    where: {
      startsAt: { gte: range.from, lt: range.to },
      status: {
        in: [ReservationStatus.CONFIRMED, ReservationStatus.PENDING_APPROVAL],
      },
    },
    select: {
      venueId: true,
      startsAt: true,
      endsAt: true,
      lineTotal: true,
      bookingId: true,
    },
  });

  // Capacity: sum the venue's opening hours across every day in the period.
  const dayCount = countDaysByWeekday(range.from, range.to);

  const rows: UtilisationRow[] = venues.map((venue) => {
    const availableMinutes = venue.operatingHours.length
      ? venue.operatingHours.reduce(
          (sum, h) => sum + (h.closesAt - h.opensAt) * (dayCount[h.dayOfWeek] ?? 0),
          0,
        )
      : // A venue with no schedule is treated as available around the clock.
        totalDays(range) * 24 * 60;

    const mine = reservations.filter((r) => r.venueId === venue.id);
    const bookedMinutes = mine.reduce(
      (sum, r) => sum + minutesBetween(r.startsAt, r.endsAt),
      0,
    );

    return {
      venueId: venue.id,
      venueName: venue.name,
      availableHours: round2(availableMinutes / 60),
      bookedHours: round2(bookedMinutes / 60),
      utilisationPercent:
        availableMinutes > 0
          ? round2((bookedMinutes / availableMinutes) * 100)
          : 0,
      bookings: new Set(mine.map((r) => r.bookingId).filter(Boolean)).size,
      revenueCents: mine.reduce((sum, r) => sum + toCents(r.lineTotal), 0),
    };
  });

  rows.sort((a, b) => b.utilisationPercent - a.utilisationPercent);

  const availableHours = round2(rows.reduce((s, r) => s + r.availableHours, 0));
  const bookedHours = round2(rows.reduce((s, r) => s + r.bookedHours, 0));

  return {
    rows,
    totals: {
      availableHours,
      bookedHours,
      utilisationPercent:
        availableHours > 0 ? round2((bookedHours / availableHours) * 100) : 0,
    },
  };
}

// ---------------------------------------------------------------------------
// Payment transaction listing (audit support)
// ---------------------------------------------------------------------------

export async function paymentTransactions(range: DateRange) {
  return prisma.payment.findMany({
    where: { createdAt: { gte: range.from, lt: range.to } },
    include: { booking: { select: { reference: true, contactName: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function settledTotalCents(range: DateRange): Promise<number> {
  const payments = await prisma.payment.findMany({
    where: {
      status: PaymentStatus.SUCCEEDED,
      paidAt: { gte: range.from, lt: range.to },
    },
    select: { amount: true },
  });
  return payments.reduce((sum, p) => sum + toCents(p.amount), 0);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function totalDays(range: DateRange): number {
  return Math.max(
    0,
    Math.ceil((range.to.getTime() - range.from.getTime()) / 86_400_000),
  );
}

/** How many times each weekday (0=Sun) occurs in the range. */
function countDaysByWeekday(from: Date, to: Date): Record<number, number> {
  const counts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  const cursor = new Date(from);
  cursor.setUTCHours(0, 0, 0, 0);
  while (cursor < to) {
    counts[cursor.getUTCDay()] = (counts[cursor.getUTCDay()] ?? 0) + 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return counts;
}

/** Serialise report rows as CSV for the schedule/report export. */
export function toCsv(
  rows: Record<string, unknown>[],
  columns: { key: string; label: string }[],
): string {
  const escapeCell = (value: unknown): string => {
    if (value === null || value === undefined) return "";
    const str = value instanceof Date ? value.toISOString() : String(value);
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };

  const header = columns.map((c) => escapeCell(c.label)).join(",");
  const body = rows
    .map((row) => columns.map((c) => escapeCell(row[c.key])).join(","))
    .join("\n");
  return `${header}\n${body}`;
}
