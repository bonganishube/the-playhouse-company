import { ReservationStatus } from "@/generated/prisma/enums";
import { prisma } from "./prisma";
import {
  addMinutes,
  datesBetween,
  endOfLocalDay,
  localDayOfWeek,
  localToUtc,
  minutesBetween,
  minutesFromLocalMidnight,
  overlaps,
  startOfLocalDay,
} from "./time";

/**
 * Statuses that occupy a venue. Mirrors the WHERE clause of the
 * `reservations_no_overlap` exclusion constraint, the two must stay in step,
 * so both are defined from this single list.
 */
export const OCCUPYING_STATUSES = [
  ReservationStatus.HELD,
  ReservationStatus.PENDING_PAYMENT,
  ReservationStatus.PENDING_APPROVAL,
  ReservationStatus.CONFIRMED,
] as const;

/**
 * Occupancy that belongs to somebody else.
 *
 * A customer's own cart holds are real occupancy to everyone else, but to the
 * customer who just placed them they are simply the dates they chose. Counting
 * them as a clash is what made the assistant tell a customer that the date
 * they had reserved a moment earlier was no longer available, and made a
 * second look at the calendar contradict the first.
 *
 * The null is spelled out rather than left to the comparison. Every confirmed
 * or pending booking has no cart, and in SQL `cartId <> $1` is null, not true,
 * for a null cartId; relying on the bare inequality would have quietly stopped
 * real bookings blocking anything, which is the one failure this whole module
 * exists to prevent.
 */
function excludingCart(cartId?: string) {
  return cartId ? { OR: [{ cartId: null }, { cartId: { not: cartId } }] } : {};
}

export type VenueRules = {
  id: string;
  timezone: string;
  isActive: boolean;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  minBookingMinutes: number;
  maxBookingMinutes: number | null;
  slotIncrementMinutes: number;
  minNoticeHours: number;
  maxAdvanceDays: number;
};

/**
 * Expand a customer-facing booking window into the range actually held against
 * the venue, including operational buffers for preparation and cleaning.
 *
 * Note the enforced gap between two consecutive bookings is the first
 * booking's `bufferAfterMinutes` plus the second's `bufferBeforeMinutes`.
 * Configure a single turnaround period on one side (typically "after") unless
 * preparation and cleaning are genuinely separate windows.
 */
export function bufferedBlock(
  venue: Pick<VenueRules, "bufferBeforeMinutes" | "bufferAfterMinutes">,
  startsAt: Date,
  endsAt: Date,
): { blockStartsAt: Date; blockEndsAt: Date } {
  return {
    blockStartsAt: addMinutes(startsAt, -venue.bufferBeforeMinutes),
    blockEndsAt: addMinutes(endsAt, venue.bufferAfterMinutes),
  };
}

export type SlotCheck =
  | { ok: true }
  | { ok: false; code: SlotRejection; message: string };

export type SlotRejection =
  | "VENUE_INACTIVE"
  | "INVALID_RANGE"
  | "TOO_SHORT"
  | "TOO_LONG"
  | "MISALIGNED"
  | "OUTSIDE_OPERATING_HOURS"
  | "CLOSED"
  | "TOO_SOON"
  | "TOO_FAR_AHEAD"
  | "ALREADY_BOOKED";

function reject(code: SlotRejection, message: string): SlotCheck {
  return { ok: false, code, message };
}

/**
 * Full validation of a proposed booking window against every venue rule.
 *
 * This is advisory: the authoritative protection against a double booking is
 * the database exclusion constraint, which catches races this check cannot.
 * Callers must still handle a conflict at write time.
 */
export async function checkSlot(
  venueId: string,
  startsAt: Date,
  endsAt: Date,
  options: {
    ignoreReservationId?: string;
    /** Treat this cart's own holds as free, see excludingCart. */
    ignoreCartId?: string;
    now?: Date;
  } = {},
): Promise<SlotCheck> {
  const now = options.now ?? new Date();

  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    include: { operatingHours: true },
  });
  if (!venue) return reject("VENUE_INACTIVE", "Venue not found.");
  if (!venue.isActive) {
    return reject("VENUE_INACTIVE", "This venue is not currently bookable.");
  }

  const duration = minutesBetween(startsAt, endsAt);
  if (duration <= 0) {
    return reject("INVALID_RANGE", "The end time must be after the start time.");
  }
  if (duration < venue.minBookingMinutes) {
    return reject(
      "TOO_SHORT",
      `Minimum booking for this venue is ${formatMinutes(venue.minBookingMinutes)}.`,
    );
  }
  if (venue.maxBookingMinutes && duration > venue.maxBookingMinutes) {
    return reject(
      "TOO_LONG",
      `Maximum booking for this venue is ${formatMinutes(venue.maxBookingMinutes)}.`,
    );
  }

  // Start times must land on the venue's booking grid.
  const startMinutes = minutesFromLocalMidnight(startsAt, venue.timezone);
  if (startMinutes % venue.slotIncrementMinutes !== 0) {
    return reject(
      "MISALIGNED",
      `Bookings start on ${venue.slotIncrementMinutes}-minute intervals.`,
    );
  }
  if (duration % venue.slotIncrementMinutes !== 0) {
    return reject(
      "MISALIGNED",
      `Bookings are made in ${venue.slotIncrementMinutes}-minute increments.`,
    );
  }

  // Lead time and booking horizon.
  const noticeMs = venue.minNoticeHours * 3_600_000;
  if (startsAt.getTime() - now.getTime() < noticeMs) {
    return reject(
      "TOO_SOON",
      `This venue requires at least ${venue.minNoticeHours} hours' notice.`,
    );
  }
  const horizonMs = venue.maxAdvanceDays * 86_400_000;
  if (startsAt.getTime() - now.getTime() > horizonMs) {
    return reject(
      "TOO_FAR_AHEAD",
      `Bookings open ${venue.maxAdvanceDays} days in advance.`,
    );
  }

  // Operating hours are tested against the customer-facing window; buffers are
  // permitted to run outside opening hours since staff handle turnaround.
  const hoursCheck = withinOperatingHours(venue, startsAt, endsAt);
  if (!hoursCheck.ok) return hoursCheck;

  // Closures (public holidays, maintenance, productions).
  const closure = await prisma.venueClosure.findFirst({
    where: {
      venueId,
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt },
    },
  });
  if (closure) {
    return reject(
      "CLOSED",
      `The venue is unavailable during this period: ${closure.reason}.`,
    );
  }

  // Existing occupancy, buffers included on both sides.
  const { blockStartsAt, blockEndsAt } = bufferedBlock(venue, startsAt, endsAt);
  const conflict = await prisma.reservation.findFirst({
    where: {
      venueId,
      status: { in: [...OCCUPYING_STATUSES] },
      blockStartsAt: { lt: blockEndsAt },
      blockEndsAt: { gt: blockStartsAt },
      ...(options.ignoreReservationId
        ? { id: { not: options.ignoreReservationId } }
        : {}),
      ...excludingCart(options.ignoreCartId),
    },
  });
  if (conflict) {
    return reject(
      "ALREADY_BOOKED",
      "That time is no longer available for this venue.",
    );
  }

  return { ok: true };
}

function withinOperatingHours(
  venue: {
    timezone: string;
    operatingHours: { dayOfWeek: number; opensAt: number; closesAt: number }[];
  },
  startsAt: Date,
  endsAt: Date,
): SlotCheck {
  if (venue.operatingHours.length === 0) return { ok: true }; // 24/7 venue

  const startMin = minutesFromLocalMidnight(startsAt, venue.timezone);
  const duration = minutesBetween(startsAt, endsAt);
  const endMin = startMin + duration;

  // A booking may not span past local midnight into the next day's schedule.
  if (endMin > 1440) {
    return reject(
      "OUTSIDE_OPERATING_HOURS",
      "Bookings cannot run past midnight. Please book each day separately.",
    );
  }

  // Derived from the instant in the venue's zone, so a booking late on a SAST
  // evening is not attributed to the previous UTC day.
  const localDow = localDayOfWeekOfInstant(startsAt, venue.timezone);

  const hours = venue.operatingHours.find((h) => h.dayOfWeek === localDow);
  if (!hours) {
    return reject("CLOSED", "The venue is closed on this day.");
  }
  if (startMin < hours.opensAt || endMin > hours.closesAt) {
    return reject(
      "OUTSIDE_OPERATING_HOURS",
      `On this day the venue is open ${clock(hours.opensAt)}–${clock(hours.closesAt)}.`,
    );
  }
  return { ok: true };
}

function localDayOfWeekOfInstant(at: Date, timezone: string): number | null {
  const label = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
  }).format(at);
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[label] ?? null;
}

function clock(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(
    minutes % 60,
  ).padStart(2, "0")}`;
}

function formatMinutes(minutes: number): string {
  if (minutes % 60 === 0) {
    const h = minutes / 60;
    return `${h} hour${h === 1 ? "" : "s"}`;
  }
  return `${minutes} minutes`;
}

// ---------------------------------------------------------------------------
// Day grid, used by the booking UI
// ---------------------------------------------------------------------------

export type DaySlot = {
  /** Minutes from venue-local midnight. */
  startMinutes: number;
  endMinutes: number;
  /** ISO instants, for submitting a selection back to the server. */
  startsAt: string;
  endsAt: string;
  available: boolean;
  reason?: "BOOKED" | "CLOSED" | "PAST";
};

export type DayAvailability = {
  date: string;
  timezone: string;
  isOpen: boolean;
  opensAt: number | null;
  closesAt: number | null;
  slotIncrementMinutes: number;
  minBookingMinutes: number;
  slots: DaySlot[];
};

/**
 * Build the bookable grid for one venue-local day. Each cell is one booking
 * increment; the UI lets a customer select a contiguous run of free cells.
 */
export async function getDayAvailability(
  venueId: string,
  date: string,
  now: Date = new Date(),
  options: { ignoreCartId?: string } = {},
): Promise<DayAvailability> {
  const venue = await prisma.venue.findUniqueOrThrow({
    where: { id: venueId },
    include: { operatingHours: true },
  });

  const dow = localDayOfWeek(date, venue.timezone);
  const hours = venue.operatingHours.find((h) => h.dayOfWeek === dow);
  const opensAt = hours?.opensAt ?? (venue.operatingHours.length ? null : 0);
  const closesAt = hours?.closesAt ?? (venue.operatingHours.length ? null : 1440);

  const base: DayAvailability = {
    date,
    timezone: venue.timezone,
    isOpen: opensAt !== null && closesAt !== null,
    opensAt,
    closesAt,
    slotIncrementMinutes: venue.slotIncrementMinutes,
    minBookingMinutes: venue.minBookingMinutes,
    slots: [],
  };
  if (opensAt === null || closesAt === null) return base;

  const dayStart = startOfLocalDay(date, venue.timezone);
  const dayEnd = endOfLocalDay(date, venue.timezone);

  // Release lapsed holds first so abandoned carts do not appear as occupancy.
  await releaseExpiredHolds(now);

  const [reservations, closures] = await Promise.all([
    prisma.reservation.findMany({
      where: {
        venueId,
        status: { in: [...OCCUPYING_STATUSES] },
        blockStartsAt: { lt: dayEnd },
        blockEndsAt: { gt: dayStart },
        ...excludingCart(options.ignoreCartId),
      },
      select: { blockStartsAt: true, blockEndsAt: true },
    }),
    prisma.venueClosure.findMany({
      where: { venueId, startsAt: { lt: dayEnd }, endsAt: { gt: dayStart } },
      select: { startsAt: true, endsAt: true },
    }),
  ]);

  const noticeCutoff = new Date(now.getTime() + venue.minNoticeHours * 3_600_000);

  const slots: DaySlot[] = [];
  for (
    let m = opensAt;
    m + venue.slotIncrementMinutes <= closesAt;
    m += venue.slotIncrementMinutes
  ) {
    const cellStart = localToUtc(date, m, venue.timezone);
    const cellEnd = addMinutes(cellStart, venue.slotIncrementMinutes);

    // A cell is occupied if it intersects an existing buffered block, or if a
    // booking placed here would push its own buffer into one.
    const { blockStartsAt, blockEndsAt } = bufferedBlock(venue, cellStart, cellEnd);

    let available = true;
    let reason: DaySlot["reason"];

    if (cellStart < noticeCutoff) {
      available = false;
      reason = "PAST";
    } else if (
      closures.some((c) => overlaps(cellStart, cellEnd, c.startsAt, c.endsAt))
    ) {
      available = false;
      reason = "CLOSED";
    } else if (
      reservations.some((r) =>
        overlaps(blockStartsAt, blockEndsAt, r.blockStartsAt, r.blockEndsAt),
      )
    ) {
      available = false;
      reason = "BOOKED";
    }

    slots.push({
      startMinutes: m,
      endMinutes: m + venue.slotIncrementMinutes,
      startsAt: cellStart.toISOString(),
      endsAt: cellEnd.toISOString(),
      available,
      reason,
    });
  }

  base.slots = slots;
  return base;
}

// ---------------------------------------------------------------------------
// Whole-day availability, for venues sold at a fixed daily rate
// ---------------------------------------------------------------------------

export type DayOption = {
  /** Venue-local calendar date, "2026-09-01". */
  date: string;
  available: boolean;
  reason?: "BOOKED" | "CLOSED" | "PAST";
  /** The hire window for that date, as UTC instants. */
  startsAt: string;
  endsAt: string;
};

/**
 * Which dates a daily-rate venue can be hired on.
 *
 * A day's hire covers the venue's operating window for that date rather than
 * the full calendar day, so the turnaround buffer runs into the small hours
 * without spuriously blocking the following morning.
 */
export async function getDayOptions(
  venueId: string,
  from: string,
  to: string,
  now: Date = new Date(),
  options: { ignoreCartId?: string } = {},
): Promise<{ timezone: string; days: DayOption[] }> {
  const venue = await prisma.venue.findUniqueOrThrow({
    where: { id: venueId },
    include: { operatingHours: true },
  });

  await releaseExpiredHolds(now);

  const rangeStart = startOfLocalDay(from, venue.timezone);
  const rangeEnd = endOfLocalDay(to, venue.timezone);

  const [reservations, closures] = await Promise.all([
    prisma.reservation.findMany({
      where: {
        venueId,
        status: { in: [...OCCUPYING_STATUSES] },
        blockStartsAt: { lt: rangeEnd },
        blockEndsAt: { gt: rangeStart },
        ...excludingCart(options.ignoreCartId),
      },
      select: { blockStartsAt: true, blockEndsAt: true },
    }),
    prisma.venueClosure.findMany({
      where: { venueId, startsAt: { lt: rangeEnd }, endsAt: { gt: rangeStart } },
      select: { startsAt: true, endsAt: true },
    }),
  ]);

  const noticeCutoff = new Date(now.getTime() + venue.minNoticeHours * 3_600_000);
  const horizon = new Date(now.getTime() + venue.maxAdvanceDays * 86_400_000);

  const days: DayOption[] = [];
  for (const date of datesBetween(from, to)) {
    const dow = localDayOfWeek(date, venue.timezone);
    const hours = venue.operatingHours.find((h) => h.dayOfWeek === dow);

    // No schedule for that weekday means the venue is closed.
    if (!hours && venue.operatingHours.length > 0) {
      const dayStart = startOfLocalDay(date, venue.timezone);
      days.push({
        date,
        available: false,
        reason: "CLOSED",
        startsAt: dayStart.toISOString(),
        endsAt: dayStart.toISOString(),
      });
      continue;
    }

    const opensAt = hours?.opensAt ?? 0;
    const closesAt = hours?.closesAt ?? 1440;
    const startsAt = localToUtc(date, opensAt, venue.timezone);
    const endsAt = localToUtc(date, closesAt, venue.timezone);
    const { blockStartsAt, blockEndsAt } = bufferedBlock(venue, startsAt, endsAt);

    let available = true;
    let reason: DayOption["reason"];

    if (startsAt < noticeCutoff || startsAt > horizon) {
      available = false;
      reason = "PAST";
    } else if (
      closures.some((c) => overlaps(startsAt, endsAt, c.startsAt, c.endsAt))
    ) {
      available = false;
      reason = "CLOSED";
    } else if (
      reservations.some((r) =>
        overlaps(blockStartsAt, blockEndsAt, r.blockStartsAt, r.blockEndsAt),
      )
    ) {
      available = false;
      reason = "BOOKED";
    }

    days.push({
      date,
      available,
      reason,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
    });
  }

  return { timezone: venue.timezone, days };
}

/**
 * Expire cart holds whose lifetime has lapsed, returning the slots to the
 * pool. Called opportunistically before availability reads and on a schedule
 * via /api/maintenance/sweep.
 */
export async function releaseExpiredHolds(now: Date = new Date()): Promise<number> {
  const result = await prisma.reservation.updateMany({
    where: {
      status: ReservationStatus.HELD,
      holdExpiresAt: { lt: now },
    },
    data: { status: ReservationStatus.EXPIRED },
  });
  return result.count;
}
