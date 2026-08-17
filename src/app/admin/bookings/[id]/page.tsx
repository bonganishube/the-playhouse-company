import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ApprovalPanel,
  CancelPanel,
  CancellationRequestPanel,
  PaymentPanel,
  RefundPanel,
} from "@/components/admin/BookingActions";
import { NotificationsPanel } from "@/components/admin/NotificationsPanel";
import { Card, DetailRow, StatusBadge } from "@/components/ui";
import { can, requireCapability, venueScopeFor } from "@/lib/auth";
import { mailDeliversToRecipients } from "@/lib/env";
import { formatCents, toCents } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { refundableCents } from "@/lib/refunds";
import { gatewaySupportsRefund } from "@/lib/payments";
import { formatDateTime, formatRange } from "@/lib/time";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/admin/bookings/[id]">) {
  const { id } = await params;
  const booking = await prisma.booking.findUnique({
    where: { id },
    select: { reference: true },
  });
  return { title: booking ? `Booking ${booking.reference}` : "Booking" };
}

export default async function AdminBookingDetail({
  params,
}: PageProps<"/admin/bookings/[id]">) {
  const user = await requireCapability("bookings.view");
  const { id } = await params;

  const booking = await prisma.booking.findUnique({
    where: { id },
    include: {
      user: true,
      reservations: { include: { venue: true }, orderBy: { startsAt: "asc" } },
      payments: {
        orderBy: { createdAt: "desc" },
        include: { events: { orderBy: { createdAt: "desc" } } },
      },
    },
  });
  if (!booking) notFound();

  // Venue managers may only open bookings within their remit.
  const scope = await venueScopeFor(user);
  if (scope && !booking.reservations.every((r) => scope.includes(r.venueId))) {
    notFound();
  }

  const emails = await prisma.emailLog.findMany({
    where: { bookingId: booking.id },
    orderBy: { createdAt: "desc" },
  });

  const auditTrail = await prisma.auditLog.findMany({
    where: { entityType: "Booking", entityId: booking.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  const totalCents = toCents(booking.total);
  const paidCents = toCents(booking.amountPaid);
  const outstandingCents = totalCents - paidCents;

  return (
    <>
      <nav className="mb-4 text-sm text-ink-500">
        <Link href="/admin/bookings" className="hover:text-brand-600">
          Bookings
        </Link>
        <span className="mx-2">/</span>
        <span className="font-mono text-ink-700">{booking.reference}</span>
      </nav>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-mono text-2xl">{booking.reference}</h1>
          <p className="mt-1 text-sm text-ink-500">
            Created {formatDateTime(booking.createdAt)} · {booking.workflow === "APPROVAL_REQUIRED" ? "Approval workflow" : "Instant confirmation"}
          </p>
        </div>
        <StatusBadge status={booking.status} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card>
            <h2 className="border-b border-parchment-300 px-5 py-3 text-lg">
              Reserved venues
            </h2>
            <ul className="divide-y divide-parchment-200">
              {booking.reservations.map((r) => (
                <li key={r.id} className="flex flex-wrap justify-between gap-3 px-5 py-3">
                  <div>
                    <p className="font-medium">{r.venue.name}</p>
                    <p className="text-sm text-ink-500">
                      {formatRange(r.startsAt, r.endsAt, r.venue.timezone)}
                    </p>
                    <p className="text-xs text-ink-500">
                      Held {formatRange(r.blockStartsAt, r.blockEndsAt, r.venue.timezone)}{" "}
                      (including turnaround)
                    </p>
                    {r.outlookEventId && (
                      <p className="mt-0.5 text-xs text-green-800">
                        Synchronised to Outlook
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="tabular">
                      {formatCents(toCents(r.lineTotal), r.currency)}
                    </p>
                    <p className="text-xs text-ink-500">
                      {r.rateLabel} × {r.quantity.toString()}
                    </p>
                    <div className="mt-1">
                      <StatusBadge status={r.status} />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <h2 className="border-b border-parchment-300 px-5 py-3 text-lg">
              Transactions
            </h2>
            {booking.payments.length === 0 ? (
              <p className="px-5 py-5 text-sm text-ink-500">
                No payment has been attempted.
              </p>
            ) : (
              <ul className="divide-y divide-parchment-200">
                {booking.payments.map((payment) => (
                  <li key={payment.id} className="px-5 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm">
                          <span className="font-medium">{payment.gateway}</span>
                          <span className="text-ink-500"> · {payment.purpose}</span>
                        </p>
                        <p className="font-mono text-xs text-ink-500">
                          {payment.reference}
                        </p>
                        {payment.receiptNumber && (
                          <p className="font-mono text-xs text-green-800">
                            Receipt {payment.receiptNumber}
                          </p>
                        )}
                        {payment.gatewayReference && (
                          <p className="font-mono text-xs text-ink-500">
                            Gateway ref {payment.gatewayReference}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="tabular">
                          {formatCents(toCents(payment.amount), payment.currency)}
                        </p>
                        {toCents(payment.refundedAmount ?? 0) > 0 && (
                          <p className="text-xs text-red-800">
                            {formatCents(toCents(payment.refundedAmount ?? 0), payment.currency)}{" "}
                            refunded
                          </p>
                        )}
                        <div className="mt-1">
                          <StatusBadge status={payment.status} />
                        </div>
                      </div>
                    </div>

                    {/* Refunds are finance's to make, and only against money
                        actually collected. */}
                    {can(user.role, "payments.record") &&
                      refundableCents(payment) > 0 && (
                        <RefundPanel
                          paymentId={payment.id}
                          refundableLabel={formatCents(
                            refundableCents(payment),
                            payment.currency,
                          )}
                          refundableAmount={(refundableCents(payment) / 100).toFixed(2)}
                          supportsAutomatic={gatewaySupportsRefund(payment.gateway)}
                          gatewayName={payment.gateway}
                        />
                      )}

                    {payment.events.length > 0 && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs text-ink-500">
                          Audit trail ({payment.events.length} event
                          {payment.events.length === 1 ? "" : "s"})
                        </summary>
                        <ul className="mt-2 space-y-1 border-l-2 border-parchment-300 pl-3">
                          {payment.events.map((event) => (
                            <li key={event.id} className="text-xs">
                              <span className="tabular text-ink-500">
                                {formatDateTime(event.createdAt)}
                              </span>{" "}
                              <span className="font-mono">{event.type}</span>{" "}
                              {event.verified ? (
                                <span className="text-green-700">verified</span>
                              ) : (
                                <span className="text-red-700">unverified</span>
                              )}
                              {event.sourceIp && (
                                <span className="text-ink-500"> from {event.sourceIp}</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <NotificationsPanel
            bookingId={booking.id}
            deliversToRecipients={mailDeliversToRecipients()}
            emails={emails.map((e) => ({
              id: e.id,
              template: e.template,
              to: e.to,
              subject: e.subject,
              status: e.status,
              attempts: e.attempts,
              sentAt: formatDateTime(e.lastAttemptAt),
              error: e.error,
              previewUrl: e.previewUrl,
            }))}
          />

          {auditTrail.length > 0 && (
            <Card>
              <h2 className="border-b border-parchment-300 px-5 py-3 text-lg">
                Booking history
              </h2>
              <ul className="divide-y divide-parchment-200">
                {auditTrail.map((entry) => (
                  <li key={entry.id} className="px-5 py-2 text-xs">
                    <span className="tabular text-ink-500">
                      {formatDateTime(entry.createdAt)}
                    </span>{" "}
                    <span className="font-mono text-ink-900">{entry.action}</span>{" "}
                    <span className="text-ink-500">by {entry.actorLabel}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <aside className="space-y-6">
          <Card className="p-5">
            <h2 className="mb-2 text-lg">Customer</h2>
            <dl>
              <DetailRow label="Name">{booking.contactName}</DetailRow>
              <DetailRow label="Email">
                <a href={`mailto:${booking.contactEmail}`} className="text-brand-600">
                  {booking.contactEmail}
                </a>
              </DetailRow>
              {booking.contactPhone && (
                <DetailRow label="Telephone">{booking.contactPhone}</DetailRow>
              )}
              {booking.organisation && (
                <DetailRow label="Organisation">{booking.organisation}</DetailRow>
              )}
              {booking.eventTitle && (
                <DetailRow label="Event">{booking.eventTitle}</DetailRow>
              )}
            </dl>
            {booking.purpose && (
              <p className="mt-3 border-t border-parchment-200 pt-3 text-sm text-ink-700">
                {booking.purpose}
              </p>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="mb-2 text-lg">Financial position</h2>
            <dl>
              <DetailRow label="Booking total">
                <span className="tabular">{formatCents(totalCents, booking.currency)}</span>
              </DetailRow>
              <DetailRow label="Required upfront">
                <span className="tabular">
                  {formatCents(toCents(booking.amountDue), booking.currency)}
                </span>
              </DetailRow>
              <DetailRow label="Received">
                <span className="tabular">{formatCents(paidCents, booking.currency)}</span>
              </DetailRow>
              <DetailRow label="Outstanding">
                <span
                  className={`tabular font-semibold ${outstandingCents > 0 ? "text-brand-700" : ""}`}
                >
                  {formatCents(outstandingCents, booking.currency)}
                </span>
              </DetailRow>
              <DetailRow label="Arrangement">
                {booking.paymentPolicy === "DEPOSIT_ALLOWED" ? "Deposit" : "Full upfront"}
              </DetailRow>
            </dl>
          </Card>

          {booking.cancellationRequestedAt &&
            can(user.role, "bookings.cancel") && (
              <CancellationRequestPanel
                bookingId={booking.id}
                requestedAt={formatDateTime(booking.cancellationRequestedAt)}
                reason={booking.cancellationRequestReason ?? "No reason given."}
                refundableLabel={formatCents(paidCents, booking.currency)}
              />
            )}

          {booking.status === "PENDING_APPROVAL" &&
            can(user.role, "bookings.approve") && (
              <ApprovalPanel bookingId={booking.id} />
            )}

          {outstandingCents > 0 && can(user.role, "payments.record") && (
            <PaymentPanel
              bookingId={booking.id}
              outstandingLabel={formatCents(outstandingCents, booking.currency)}
              outstandingAmount={outstandingCents}
              canRequestBalance={
                booking.paymentPolicy === "DEPOSIT_ALLOWED" &&
                toCents(booking.amountDue) < totalCents
              }
            />
          )}

          {!["CANCELLED", "REJECTED"].includes(booking.status) &&
            can(user.role, "bookings.cancel") && (
              <CancelPanel bookingId={booking.id} />
            )}
        </aside>
      </div>
    </>
  );
}
