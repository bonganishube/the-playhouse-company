import { ReservationStatus } from "@/generated/prisma/enums";
import { outlookConfigured } from "../env";
import { prisma } from "../prisma";
import { formatRange } from "../time";
import { createEvent, deleteEvent, GraphNotConfiguredError } from "./graph";

/**
 * Venue schedules are updated automatically whenever a booking is confirmed.
 *
 * Each reservation maps to one Outlook event on the venue's resource mailbox,
 * so the operations team sees the same occupancy in Outlook as the platform
 * enforces. The Graph event id is stored on the reservation, which makes
 * synchronisation idempotent and cancellation exact.
 *
 * When Graph is not configured the platform records that the sync was skipped
 * and continues — Outlook is a projection of the booking record, never its
 * source of truth, so the booking itself is unaffected.
 */

export async function syncBookingToCalendar(bookingId: string): Promise<void> {
  if (!outlookConfigured()) return;

  const booking = await prisma.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: { reservations: { include: { venue: true } } },
  });

  for (const reservation of booking.reservations) {
    if (reservation.status !== ReservationStatus.CONFIRMED) continue;
    if (reservation.outlookEventId) continue; // already synced

    const { venue } = reservation;
    if (!venue.outlookMailbox) continue; // venue not mapped to a mailbox

    try {
      const eventId = await createEvent(
        venue.outlookMailbox,
        venue.outlookCalendarId,
        {
          subject: `${booking.eventTitle ?? "Venue hire"} — ${booking.reference}`,
          body: buildEventBody(booking, venue.name),
          startsAt: reservation.startsAt,
          endsAt: reservation.endsAt,
          timezone: venue.timezone,
          location: venue.name,
          bookingReference: booking.reference,
        },
      );

      await prisma.reservation.update({
        where: { id: reservation.id },
        data: { outlookEventId: eventId },
      });
    } catch (error) {
      if (error instanceof GraphNotConfiguredError) return;
      // Logged, not thrown: a calendar outage must not undo a paid booking.
      console.error(
        `[calendar] failed to sync reservation ${reservation.id}`,
        error,
      );
    }
  }
}

export async function removeBookingFromCalendar(
  bookingId: string,
): Promise<void> {
  if (!outlookConfigured()) return;

  const reservations = await prisma.reservation.findMany({
    where: { bookingId, outlookEventId: { not: null } },
    include: { venue: true },
  });

  for (const reservation of reservations) {
    if (!reservation.venue.outlookMailbox || !reservation.outlookEventId) continue;
    try {
      await deleteEvent(
        reservation.venue.outlookMailbox,
        reservation.outlookEventId,
      );
      await prisma.reservation.update({
        where: { id: reservation.id },
        data: { outlookEventId: null },
      });
    } catch (error) {
      console.error(
        `[calendar] failed to remove event for reservation ${reservation.id}`,
        error,
      );
    }
  }
}

/**
 * Re-drive synchronisation for confirmed bookings that have no Outlook event —
 * used to recover after a Graph outage. Exposed via the maintenance endpoint.
 */
export async function resyncPendingCalendarEvents(): Promise<number> {
  if (!outlookConfigured()) return 0;

  const pending = await prisma.reservation.findMany({
    where: {
      status: ReservationStatus.CONFIRMED,
      outlookEventId: null,
      booking: { isNot: null },
      venue: { outlookMailbox: { not: null } },
    },
    select: { bookingId: true },
    distinct: ["bookingId"],
  });

  let synced = 0;
  for (const row of pending) {
    if (!row.bookingId) continue;
    await syncBookingToCalendar(row.bookingId);
    synced += 1;
  }
  return synced;
}

function buildEventBody(
  booking: {
    reference: string;
    contactName: string;
    contactEmail: string;
    contactPhone: string | null;
    organisation: string | null;
    purpose: string | null;
  },
  venueName: string,
): string {
  const rows = [
    ["Booking reference", booking.reference],
    ["Venue", venueName],
    ["Contact", booking.contactName],
    ["Email", booking.contactEmail],
    ["Telephone", booking.contactPhone ?? "—"],
    ["Organisation", booking.organisation ?? "—"],
    ["Purpose", booking.purpose ?? "—"],
  ];
  return `<table>${rows
    .map(
      ([label, value]) =>
        `<tr><td><strong>${escapeHtml(label)}</strong></td><td>${escapeHtml(value)}</td></tr>`,
    )
    .join("")}</table>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Human-readable range, reused by notification templates. */
export { formatRange };
