import { formatCents } from "../money";
import { formatRange } from "../time";

/**
 * Email templates.
 *
 * Plain, table-based HTML with inline styles — the only markup that renders
 * dependably across Outlook, Gmail and mobile clients. Every message also
 * carries a text alternative.
 */

const BRAND = "#8a1538"; // Playhouse burgundy
const INK = "#1a1a1a";
const MUTED = "#5c5c5c";
const LINE = "#e2e2e2";

export type BookingLine = {
  venueName: string;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  rateLabel: string;
  quantity: string;
  lineTotalCents: number;
};

export type BookingEmailData = {
  reference: string;
  contactName: string;
  eventTitle?: string | null;
  lines: BookingLine[];
  totalCents: number;
  /** Tariff is VAT-inclusive; this is the VAT portion of totalCents. */
  vatAmountCents: number;
  vatRate: number;
  amountPaidCents: number;
  amountDueCents: number;
  currency: string;
  bookingUrl: string;
};

function layout(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title></head>
<body style="margin:0;padding:0;background:#f5f4f2;font-family:Georgia,'Times New Roman',serif;color:${INK};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f4f2;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid ${LINE};">
        <tr><td style="background:${BRAND};padding:20px 24px;">
          <div style="color:#ffffff;font-size:18px;letter-spacing:0.5px;">THE PLAYHOUSE COMPANY</div>
          <div style="color:#f0d9e0;font-size:12px;letter-spacing:1px;text-transform:uppercase;margin-top:4px;">Venue Bookings</div>
        </td></tr>
        <tr><td style="padding:24px;font-size:15px;line-height:1.6;">${bodyHtml}</td></tr>
        <tr><td style="padding:16px 24px;border-top:1px solid ${LINE};color:${MUTED};font-size:12px;line-height:1.5;">
          The Playhouse Company · 231 Anton Lembede Street, Durban, 4001<br>
          This message was sent automatically. Please retain your booking reference for all correspondence.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function lineItemsTable(lines: BookingLine[], currency: string): string {
  const rows = lines
    .map(
      (l) => `<tr>
        <td style="padding:10px 0;border-bottom:1px solid ${LINE};">
          <strong>${escape(l.venueName)}</strong><br>
          <span style="color:${MUTED};font-size:13px;">${escape(formatRange(l.startsAt, l.endsAt, l.timezone))}</span><br>
          <span style="color:${MUTED};font-size:13px;">${escape(l.rateLabel)} × ${escape(l.quantity)}</span>
        </td>
        <td style="padding:10px 0;border-bottom:1px solid ${LINE};text-align:right;white-space:nowrap;vertical-align:top;">
          ${escape(formatCents(l.lineTotalCents, currency))}
        </td>
      </tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;font-size:14px;">${rows}</table>`;
}

function totalsBlock(data: BookingEmailData): string {
  const outstanding = data.amountDueCents - data.amountPaidCents;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">
    <tr><td style="padding:4px 0;">Booking total (incl. VAT)</td><td style="padding:4px 0;text-align:right;">${escape(formatCents(data.totalCents, data.currency))}</td></tr>
    <tr><td style="padding:4px 0;color:${MUTED};">of which VAT @ ${escape(String(data.vatRate))}%</td><td style="padding:4px 0;text-align:right;color:${MUTED};">${escape(formatCents(data.vatAmountCents, data.currency))}</td></tr>
    <tr><td style="padding:4px 0;">Paid to date</td><td style="padding:4px 0;text-align:right;">${escape(formatCents(data.amountPaidCents, data.currency))}</td></tr>
    ${
      outstanding > 0
        ? `<tr><td style="padding:8px 0;border-top:1px solid ${LINE};"><strong>Balance outstanding</strong></td><td style="padding:8px 0;border-top:1px solid ${LINE};text-align:right;"><strong>${escape(formatCents(outstanding, data.currency))}</strong></td></tr>`
        : `<tr><td style="padding:8px 0;border-top:1px solid ${LINE};" colspan="2"><strong>Paid in full — thank you.</strong></td></tr>`
    }
  </table>`;
}

function button(url: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0;"><tr>
    <td style="background:${BRAND};"><a href="${escape(url)}" style="display:inline-block;padding:12px 22px;color:#ffffff;text-decoration:none;font-size:14px;font-family:Arial,sans-serif;">${escape(label)}</a></td>
  </tr></table>`;
}

function referenceBadge(reference: string): string {
  return `<div style="background:#faf7f8;border-left:3px solid ${BRAND};padding:12px 16px;margin:16px 0;">
    <div style="font-size:12px;color:${MUTED};text-transform:uppercase;letter-spacing:1px;">Booking reference</div>
    <div style="font-size:20px;font-family:'Courier New',monospace;letter-spacing:1px;">${escape(reference)}</div>
  </div>`;
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export function bookingConfirmed(data: BookingEmailData) {
  const html = layout(
    `Booking confirmed — ${data.reference}`,
    `<p>Dear ${escape(data.contactName)},</p>
     <p>Your booking with The Playhouse Company is <strong>confirmed</strong>.</p>
     ${referenceBadge(data.reference)}
     ${data.eventTitle ? `<p><strong>Event:</strong> ${escape(data.eventTitle)}</p>` : ""}
     ${lineItemsTable(data.lines, data.currency)}
     ${totalsBlock(data)}
     ${button(data.bookingUrl, "View your booking")}
     <p style="color:${MUTED};font-size:13px;">A calendar invitation is attached. Please arrive in good time and quote your reference at reception.</p>`,
  );

  const text = [
    `Dear ${data.contactName},`,
    ``,
    `Your booking with The Playhouse Company is CONFIRMED.`,
    `Reference: ${data.reference}`,
    ``,
    ...data.lines.map(
      (l) =>
        `- ${l.venueName}: ${formatRange(l.startsAt, l.endsAt, l.timezone)} — ${formatCents(l.lineTotalCents, data.currency)}`,
    ),
    ``,
    `Total: ${formatCents(data.totalCents, data.currency)}`,
    `Paid: ${formatCents(data.amountPaidCents, data.currency)}`,
    `Outstanding: ${formatCents(data.amountDueCents - data.amountPaidCents, data.currency)}`,
    ``,
    `View your booking: ${data.bookingUrl}`,
  ].join("\n");

  return { subject: `Booking confirmed — ${data.reference}`, html, text };
}

/**
 * Payment receipt, structured as a tax invoice.
 *
 * The amount received is VAT-inclusive, so the VAT portion is stated
 * separately alongside the amount excluding VAT — a South African tax invoice
 * must show all three, together with the supplier's VAT registration number.
 */
export function paymentReceipt(data: {
  reference: string;
  receiptNumber: string;
  contactName: string;
  amountCents: number;
  vatAmountCents: number;
  vatRate: number;
  currency: string;
  gateway: string;
  paidAt: Date;
  bookingUrl: string;
  outstandingCents: number;
  vatRegistrationNumber: string;
}) {
  const exclusiveCents = data.amountCents - data.vatAmountCents;

  const html = layout(
    `Tax invoice / receipt — ${data.receiptNumber}`,
    `<p>Dear ${escape(data.contactName)},</p>
     <p>We acknowledge receipt of your payment. This serves as your tax invoice and receipt.</p>
     <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;font-size:14px;border:1px solid ${LINE};">
       <tr><td style="padding:10px 14px;background:#faf7f8;">Receipt number</td><td style="padding:10px 14px;background:#faf7f8;text-align:right;font-family:'Courier New',monospace;">${escape(data.receiptNumber)}</td></tr>
       <tr><td style="padding:10px 14px;">Booking reference</td><td style="padding:10px 14px;text-align:right;font-family:'Courier New',monospace;">${escape(data.reference)}</td></tr>
       <tr><td style="padding:10px 14px;">Date</td><td style="padding:10px 14px;text-align:right;">${escape(data.paidAt.toISOString().slice(0, 10))}</td></tr>
       <tr><td style="padding:10px 14px;">Method</td><td style="padding:10px 14px;text-align:right;">${escape(data.gateway)}</td></tr>
       <tr><td style="padding:10px 14px;border-top:1px solid ${LINE};color:${MUTED};">Amount excluding VAT</td><td style="padding:10px 14px;border-top:1px solid ${LINE};text-align:right;color:${MUTED};">${escape(formatCents(exclusiveCents, data.currency))}</td></tr>
       <tr><td style="padding:10px 14px;color:${MUTED};">VAT @ ${escape(String(data.vatRate))}%</td><td style="padding:10px 14px;text-align:right;color:${MUTED};">${escape(formatCents(data.vatAmountCents, data.currency))}</td></tr>
       <tr><td style="padding:10px 14px;background:#faf7f8;"><strong>Total received</strong></td><td style="padding:10px 14px;background:#faf7f8;text-align:right;"><strong>${escape(formatCents(data.amountCents, data.currency))}</strong></td></tr>
       ${
         data.outstandingCents > 0
           ? `<tr><td style="padding:10px 14px;border-top:1px solid ${LINE};">Balance outstanding</td><td style="padding:10px 14px;border-top:1px solid ${LINE};text-align:right;"><strong>${escape(formatCents(data.outstandingCents, data.currency))}</strong></td></tr>`
           : ""
       }
     </table>
     <p style="color:${MUTED};font-size:12px;">
       The Playhouse Company${
         data.vatRegistrationNumber
           ? ` · VAT registration number ${escape(data.vatRegistrationNumber)}`
           : ""
       }
     </p>
     ${button(data.bookingUrl, "View your booking")}`,
  );

  const text = [
    `Dear ${data.contactName},`,
    ``,
    `Payment received — tax invoice and receipt.`,
    `Receipt number: ${data.receiptNumber}`,
    `Booking reference: ${data.reference}`,
    `Date: ${data.paidAt.toISOString().slice(0, 10)}`,
    `Method: ${data.gateway}`,
    ``,
    `Amount excluding VAT: ${formatCents(exclusiveCents, data.currency)}`,
    `VAT @ ${data.vatRate}%:      ${formatCents(data.vatAmountCents, data.currency)}`,
    `Total received:       ${formatCents(data.amountCents, data.currency)}`,
    ``,
    data.outstandingCents > 0
      ? `Balance outstanding: ${formatCents(data.outstandingCents, data.currency)}`
      : `Paid in full.`,
    ``,
    data.vatRegistrationNumber
      ? `The Playhouse Company · VAT registration number ${data.vatRegistrationNumber}`
      : `The Playhouse Company`,
    ``,
    data.bookingUrl,
  ].join("\n");

  return {
    subject: `Tax invoice ${data.receiptNumber} — ${data.reference}`,
    html,
    text,
  };
}

export function awaitingApproval(data: BookingEmailData) {
  const html = layout(
    `Booking received — ${data.reference}`,
    `<p>Dear ${escape(data.contactName)},</p>
     <p>Thank you. Your booking has been received and your payment processed. This venue requires
        <strong>administrative approval</strong>, so your booking is not yet final.</p>
     <p>Our venue management team will review your request and confirm shortly. You will receive a
        further email once a decision has been made.</p>
     ${referenceBadge(data.reference)}
     ${lineItemsTable(data.lines, data.currency)}
     ${button(data.bookingUrl, "Track your booking")}`,
  );
  const text = [
    `Dear ${data.contactName},`,
    ``,
    `Your booking has been received and payment processed.`,
    `This venue requires administrative approval, so it is not yet final.`,
    `Reference: ${data.reference}`,
    ``,
    data.bookingUrl,
  ].join("\n");
  return { subject: `Booking received, awaiting approval — ${data.reference}`, html, text };
}

export function approvalRequestInternal(data: BookingEmailData & { adminUrl: string }) {
  const html = layout(
    `Approval required — ${data.reference}`,
    `<p>A booking is awaiting approval.</p>
     ${referenceBadge(data.reference)}
     <p><strong>Customer:</strong> ${escape(data.contactName)}</p>
     ${lineItemsTable(data.lines, data.currency)}
     ${totalsBlock(data)}
     ${button(data.adminUrl, "Review in admin console")}`,
  );
  const text = [
    `A booking is awaiting approval.`,
    `Reference: ${data.reference}`,
    `Customer: ${data.contactName}`,
    ``,
    data.adminUrl,
  ].join("\n");
  return { subject: `Approval required — ${data.reference}`, html, text };
}

export function bookingRejected(data: {
  reference: string;
  contactName: string;
  reason: string;
  bookingUrl: string;
}) {
  const html = layout(
    `Booking not approved — ${data.reference}`,
    `<p>Dear ${escape(data.contactName)},</p>
     <p>Regrettably your booking request could not be approved.</p>
     ${referenceBadge(data.reference)}
     <p><strong>Reason:</strong> ${escape(data.reason)}</p>
     <p>Any payment made will be refunded to the original method of payment. Our team will be in
        touch regarding the refund, and we would be glad to help you find an alternative date or venue.</p>
     ${button(data.bookingUrl, "View details")}`,
  );
  const text = [
    `Dear ${data.contactName},`,
    ``,
    `Your booking ${data.reference} could not be approved.`,
    `Reason: ${data.reason}`,
    ``,
    `Any payment made will be refunded.`,
    data.bookingUrl,
  ].join("\n");
  return { subject: `Booking not approved — ${data.reference}`, html, text };
}

export function bookingCancelled(data: {
  reference: string;
  contactName: string;
  reason: string;
  bookingUrl: string;
}) {
  const html = layout(
    `Booking cancelled — ${data.reference}`,
    `<p>Dear ${escape(data.contactName)},</p>
     <p>Your booking has been cancelled.</p>
     ${referenceBadge(data.reference)}
     <p><strong>Reason:</strong> ${escape(data.reason)}</p>
     <p>If a refund is due it will be processed to the original method of payment. Please contact
        us should you wish to rebook.</p>
     ${button(data.bookingUrl, "View details")}`,
  );
  const text = [
    `Dear ${data.contactName},`,
    ``,
    `Your booking ${data.reference} has been cancelled.`,
    `Reason: ${data.reason}`,
    ``,
    data.bookingUrl,
  ].join("\n");
  return { subject: `Booking cancelled — ${data.reference}`, html, text };
}

function escape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
