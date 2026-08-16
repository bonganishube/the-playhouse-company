import { buildIcs } from "../calendar/ics";
import { env } from "../env";
import { formatCents, toCents, vatPortionOfInclusive } from "../money";
import { prisma } from "../prisma";
import { formatRange } from "../time";
import { sendMail, staffRecipients } from "./mailer";
import * as templates from "./templates";
import type { BookingEmailData } from "./templates";

/**
 * Notification despatch. Each function loads exactly what its template needs
 * and is safe to call more than once, booking.ts invokes these outside the
 * database transaction, where a retry is possible.
 */

async function loadBookingEmailData(bookingId: string): Promise<BookingEmailData> {
  const booking = await prisma.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: {
      reservations: {
        include: { venue: true },
        orderBy: { startsAt: "asc" },
      },
    },
  });

  return {
    reference: booking.reference,
    contactName: booking.contactName,
    eventTitle: booking.eventTitle,
    lines: booking.reservations.map((r) => ({
      venueName: r.venue.name,
      startsAt: r.startsAt,
      endsAt: r.endsAt,
      timezone: r.venue.timezone,
      rateLabel: r.rateLabel,
      quantity: r.quantity.toString(),
      lineTotalCents: toCents(r.lineTotal),
    })),
    totalCents: toCents(booking.total),
    vatAmountCents: toCents(booking.vatAmount),
    vatRate: Number(booking.vatRate),
    amountPaidCents: toCents(booking.amountPaid),
    amountDueCents: toCents(booking.amountDue),
    currency: booking.currency,
    bookingUrl: `${env.APP_URL}/booking/${booking.reference}`,
  };
}

export async function sendBookingConfirmedEmail(bookingId: string) {
  const booking = await prisma.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: { reservations: { include: { venue: true } } },
  });
  const data = await loadBookingEmailData(bookingId);
  const message = templates.bookingConfirmed(data);

  // Attach a calendar invitation so the customer can add it to any client.
  const ics = buildIcs(
    booking.reservations.map((r) => ({
      uid: `${r.id}@playhousecompany.com`,
      summary: `${booking.eventTitle ?? "Venue hire"}, ${r.venue.name}`,
      description: `Booking reference ${booking.reference}`,
      location: r.venue.name,
      startsAt: r.startsAt,
      endsAt: r.endsAt,
      createdAt: booking.createdAt,
    })),
    `Booking ${booking.reference}`,
  );

  return sendMail({
    to: booking.contactEmail,
    subject: message.subject,
    html: message.html,
    text: message.text,
    template: "booking-confirmed",
    bookingId,
    attachments: [
      {
        filename: `${booking.reference}.ics`,
        content: ics,
        contentType: "text/calendar; charset=utf-8; method=PUBLISH",
      },
    ],
  });
}

export async function sendPaymentReceiptEmail(paymentId: string) {
  const payment = await prisma.payment.findUniqueOrThrow({
    where: { id: paymentId },
    include: { booking: true },
  });
  if (!payment.receiptNumber) return false;

  // The payment is a VAT-inclusive amount; its VAT portion is derived at the
  // booking's snapshotted rate so the invoice matches the booking exactly.
  const vatRate = Number(payment.booking.vatRate);
  const paidCents = toCents(payment.amount);

  const message = templates.paymentReceipt({
    reference: payment.booking.reference,
    receiptNumber: payment.receiptNumber,
    contactName: payment.booking.contactName,
    amountCents: paidCents,
    vatAmountCents: vatPortionOfInclusive(paidCents, vatRate),
    vatRate,
    currency: payment.currency,
    gateway: payment.gateway,
    paidAt: payment.paidAt ?? new Date(),
    bookingUrl: `${env.APP_URL}/booking/${payment.booking.reference}`,
    outstandingCents: Math.max(
      0,
      toCents(payment.booking.total) - toCents(payment.booking.amountPaid),
    ),
    vatRegistrationNumber: env.VAT_REGISTRATION_NUMBER,
  });

  return sendMail({
    to: payment.booking.contactEmail,
    subject: message.subject,
    html: message.html,
    text: message.text,
    template: "payment-receipt",
    bookingId: payment.bookingId,
    paymentId: payment.id,
  });
}

/**
 * Two messages: one telling the customer their booking is pending, and one
 * alerting the venue managers who can act on it.
 */
export async function sendApprovalRequestEmail(bookingId: string) {
  const booking = await prisma.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: { reservations: true },
  });
  const data = await loadBookingEmailData(bookingId);

  const customer = templates.awaitingApproval(data);
  await sendMail({
    to: booking.contactEmail,
    subject: customer.subject,
    html: customer.html,
    text: customer.text,
    template: "awaiting-approval",
    bookingId,
  });

  const venueIds = [...new Set(booking.reservations.map((r) => r.venueId))];
  const recipients = await staffRecipients(venueIds);
  if (recipients.length === 0) return true;

  const internal = templates.approvalRequestInternal({
    ...data,
    adminUrl: `${env.APP_URL}/admin/bookings/${bookingId}`,
  });

  await Promise.all(
    recipients.map((to) =>
      sendMail({
        to,
        subject: internal.subject,
        html: internal.html,
        text: internal.text,
        template: "approval-request-internal",
        bookingId,
      }),
    ),
  );
  return true;
}

export async function sendBookingRejectedEmail(bookingId: string) {
  const booking = await prisma.booking.findUniqueOrThrow({
    where: { id: bookingId },
  });
  const message = templates.bookingRejected({
    reference: booking.reference,
    contactName: booking.contactName,
    reason: booking.rejectionReason ?? "No reason recorded.",
    bookingUrl: `${env.APP_URL}/booking/${booking.reference}`,
  });
  return sendMail({
    to: booking.contactEmail,
    subject: message.subject,
    html: message.html,
    text: message.text,
    template: "booking-rejected",
    bookingId,
  });
}

/**
 * A cancellation request: acknowledged to the customer, and put in front of
 * the staff who can act on it.
 */
export async function sendCancellationRequestEmail(bookingId: string) {
  const booking = await prisma.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: {
      reservations: {
        include: { venue: true },
        orderBy: { startsAt: "asc" },
      },
    },
  });

  const customer = templates.cancellationAcknowledged({
    reference: booking.reference,
    contactName: booking.contactName,
    bookingUrl: `${env.APP_URL}/booking/${booking.reference}`,
  });
  await sendMail({
    to: booking.contactEmail,
    subject: customer.subject,
    html: customer.html,
    text: customer.text,
    template: "cancellation-acknowledged",
    bookingId,
  });

  const venueIds = [...new Set(booking.reservations.map((r) => r.venueId))];
  const recipients = await staffRecipients(venueIds);
  if (recipients.length === 0) return true;

  const first = booking.reservations[0];
  const internal = templates.cancellationRequestInternal({
    reference: booking.reference,
    contactName: booking.contactName,
    contactEmail: booking.contactEmail,
    reason: booking.cancellationRequestReason ?? "No reason given.",
    paidLabel: formatCents(toCents(booking.amountPaid), booking.currency),
    venues: [...new Set(booking.reservations.map((r) => r.venue.name))].join(", "),
    bookedFor: first
      ? formatRange(first.startsAt, first.endsAt, first.venue.timezone)
      : "—",
    adminUrl: `${env.APP_URL}/admin/bookings/${booking.id}`,
  });

  await Promise.all(
    recipients.map((to) =>
      sendMail({
        to,
        subject: internal.subject,
        html: internal.html,
        text: internal.text,
        template: "cancellation-request-internal",
        bookingId,
      }),
    ),
  );
  return true;
}

export async function sendCancellationDeclinedEmail(
  bookingId: string,
  reason: string,
) {
  const booking = await prisma.booking.findUniqueOrThrow({
    where: { id: bookingId },
  });
  const message = templates.cancellationDeclined({
    reference: booking.reference,
    contactName: booking.contactName,
    reason,
    bookingUrl: `${env.APP_URL}/booking/${booking.reference}`,
  });
  return sendMail({
    to: booking.contactEmail,
    subject: message.subject,
    html: message.html,
    text: message.text,
    template: "cancellation-declined",
    bookingId,
  });
}

export async function sendBookingCancelledEmail(bookingId: string) {
  const booking = await prisma.booking.findUniqueOrThrow({
    where: { id: bookingId },
  });
  const message = templates.bookingCancelled({
    reference: booking.reference,
    contactName: booking.contactName,
    reason: booking.cancellationReason ?? "No reason recorded.",
    bookingUrl: `${env.APP_URL}/booking/${booking.reference}`,
  });
  return sendMail({
    to: booking.contactEmail,
    subject: message.subject,
    html: message.html,
    text: message.text,
    template: "booking-cancelled",
    bookingId,
  });
}
