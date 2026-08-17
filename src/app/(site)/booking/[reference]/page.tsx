import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CancelBooking, PayBalance } from "@/components/BookingActions";
import { PageHero } from "@/components/PageHero";
import { PaymentReconciler } from "@/components/PaymentReconciler";
import { Alert, ButtonLink, Card, DetailRow, StatusBadge } from "@/components/ui";
import { getSession, isStaffRole } from "@/lib/auth";
import { formatCents, toCents } from "@/lib/money";
import { activeGateway, gatewayCatalogue } from "@/lib/payments";
import { prisma } from "@/lib/prisma";
import { formatDateTime, formatRange } from "@/lib/time";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/booking/[reference]">) {
  const { reference } = await params;
  return { title: `Booking ${reference}` };
}

export default async function BookingPage({
  params,
  searchParams,
}: PageProps<"/booking/[reference]">) {
  const { reference } = await params;
  const query = await searchParams;

  const booking = await prisma.booking.findUnique({
    where: { reference },
    include: {
      reservations: { include: { venue: true }, orderBy: { startsAt: "asc" } },
      payments: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!booking) notFound();

  // Only the customer who made the booking, or staff, may view the full record.
  const session = await getSession();
  const permitted =
    session && (session.id === booking.userId || isStaffRole(session.role));
  if (!permitted) {
    redirect(`/signin?next=${encodeURIComponent(`/booking/${reference}`)}`);
  }

  const totalCents = toCents(booking.total);
  const paidCents = toCents(booking.amountPaid);
  const outstandingCents = totalCents - paidCents;
  const dueNowCents = toCents(booking.amountDue) - paidCents;
  const isLive = !["CANCELLED", "REJECTED", "COMPLETED"].includes(booking.status);

  // Same provider list the customer saw at checkout, so settling a balance
  // offers the same choice rather than silently using whichever gateway took
  // the deposit.
  const gateways = gatewayCatalogue();
  let gatewayError: string | null = null;
  try {
    activeGateway();
  } catch (error) {
    gatewayError = error instanceof Error ? error.message : "Payment is unavailable.";
  }

  return (
    <>
      <PageHero eyebrow="Booking reference" title={booking.reference} />

      <div className="mx-auto max-w-3xl px-4 py-10">
      {query.payment === "return" && booking.status === "PENDING_PAYMENT" && (
        <div className="mb-6">
          <Alert tone="info" title="Confirming your payment">
            We are confirming your payment with the provider. This page updates
            automatically as soon as it settles.
            <PaymentReconciler reference={booking.reference} />
          </Alert>
        </div>
      )}

      {query.payment === "cancelled" && (
        <div className="mb-6">
          <Alert tone="warning" title="Payment not completed">
            Your booking is being held for a short period. You may complete payment
            below before the hold lapses.
          </Alert>
        </div>
      )}

      {booking.status === "CONFIRMED" && (
        <div className="mb-6">
          <Alert tone="success" title="Your booking is confirmed">
            A confirmation email and calendar invitation have been sent to{" "}
            {booking.contactEmail}.
          </Alert>
        </div>
      )}

      {booking.status === "PENDING_APPROVAL" && (
        <div className="mb-6">
          <Alert tone="warning" title="Awaiting approval">
            Payment has been received and your dates are held. The booking becomes
            final once our venue management team approves it, usually within two
            working days.
          </Alert>
        </div>
      )}

      {booking.status === "REJECTED" && (
        <div className="mb-6">
          <Alert tone="error" title="Booking not approved">
            {booking.rejectionReason ?? "This booking could not be approved."} Any
            payment made will be refunded.
          </Alert>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-500">
          Booked on {formatDateTime(booking.createdAt)}
        </p>
        <StatusBadge status={booking.status} />
      </div>

      <Card className="mt-6">
        <h2 className="border-b border-parchment-300 px-5 py-3 text-lg">
          Reserved venues
        </h2>
        <ul className="divide-y divide-parchment-200">
          {booking.reservations.map((r) => (
            <li key={r.id} className="flex flex-wrap justify-between gap-3 px-5 py-3">
              <div>
                <Link
                  href={`/venues/${r.venue.slug}`}
                  className="font-medium hover:text-brand-600"
                >
                  {r.venue.name}
                </Link>
                <p className="text-sm text-ink-500">
                  {formatRange(r.startsAt, r.endsAt, r.venue.timezone)}
                </p>
                <p className="text-xs text-ink-500">
                  {r.rateLabel} × {r.quantity.toString()}
                </p>
              </div>
              <div className="text-right">
                <p className="tabular">{formatCents(toCents(r.lineTotal), r.currency)}</p>
                <StatusBadge status={r.status} />
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-2 text-lg">Payment</h2>
          <dl>
            <DetailRow label="Booking total">
              <span className="tabular">{formatCents(totalCents, booking.currency)}</span>
            </DetailRow>
            <DetailRow label={`of which VAT @ ${Number(booking.vatRate)}%`}>
              <span className="tabular text-ink-500">
                {formatCents(toCents(booking.vatAmount), booking.currency)}
              </span>
            </DetailRow>
            <DetailRow label="Paid to date">
              <span className="tabular">{formatCents(paidCents, booking.currency)}</span>
            </DetailRow>
            <DetailRow label="Outstanding">
              <span className="tabular font-semibold">
                {formatCents(outstandingCents, booking.currency)}
              </span>
            </DetailRow>
            {booking.paymentPolicy === "DEPOSIT_ALLOWED" && (
              <DetailRow label="Arrangement">Deposit with balance to follow</DetailRow>
            )}
          </dl>

          {dueNowCents > 0 && booking.status === "PENDING_PAYMENT" && (
            <div className="mt-4">
              <ButtonLink href={`/checkout/redirect/${booking.reference}`} size="sm">
                Complete payment
              </ButtonLink>
            </div>
          )}

        </Card>

        <Card className="p-5">
          <h2 className="mb-2 text-lg">Details</h2>
          <dl>
            <DetailRow label="Booked by">{booking.contactName}</DetailRow>
            <DetailRow label="Email">{booking.contactEmail}</DetailRow>
            {booking.contactPhone && (
              <DetailRow label="Telephone">{booking.contactPhone}</DetailRow>
            )}
            {booking.organisation && (
              <DetailRow label="Organisation">{booking.organisation}</DetailRow>
            )}
            {booking.eventTitle && (
              <DetailRow label="Event">{booking.eventTitle}</DetailRow>
            )}
            <DetailRow label="Booked on">
              {formatDateTime(booking.createdAt)}
            </DetailRow>
          </dl>
        </Card>
      </div>

      {/* Full width rather than inside the payment summary column: five
          providers in a half-width column wrap badly and push the pay button
          off the fold. */}
      {outstandingCents > 0 && booking.status !== "PENDING_PAYMENT" && isLive && (
        <PayBalance
          reference={booking.reference}
          outstandingLabel={formatCents(outstandingCents, booking.currency)}
          gateways={gateways}
          gatewayError={gatewayError}
        />
      )}

      {booking.payments.length > 0 && (
        <Card className="mt-6">
          <h2 className="border-b border-parchment-300 px-5 py-3 text-lg">
            Payment history
          </h2>
          {/* Five columns do not fit a phone. The table scrolls inside its own
              box so the page itself does not scroll sideways. */}
          <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
            <thead className="bg-parchment-100 text-left text-xs uppercase tracking-wide text-ink-500">
              <tr>
                <th className="px-5 py-2 font-medium">Date</th>
                <th className="px-5 py-2 font-medium">Receipt</th>
                <th className="px-5 py-2 font-medium">Method</th>
                <th className="px-5 py-2 text-right font-medium">Amount</th>
                <th className="px-5 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-parchment-200">
              {booking.payments.map((payment) => (
                <tr key={payment.id}>
                  <td className="whitespace-nowrap px-5 py-2 tabular">
                    {formatDateTime(payment.paidAt ?? payment.createdAt)}
                  </td>
                  <td className="whitespace-nowrap px-5 py-2 font-mono text-xs">
                    {payment.receiptNumber ?? (
                      <span className="font-sans text-ink-500">Not issued</span>
                    )}
                  </td>
                  <td className="px-5 py-2">{payment.gateway}</td>
                  <td className="px-5 py-2 text-right tabular">
                    {formatCents(toCents(payment.amount), payment.currency)}
                  </td>
                  <td className="px-5 py-2">
                    <StatusBadge status={payment.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </Card>
      )}

      {booking.cancellationRequestedAt ? (
        <div className="mt-6">
          <Alert tone="warning" title="Cancellation requested">
            We received your request on{" "}
            {formatDateTime(booking.cancellationRequestedAt)} and it is with our
            venue management team. Your booking stands until a decision is made,
            and we will write to you either way.
          </Alert>
        </div>
      ) : (
        isLive && (
          <CancelBooking
            reference={booking.reference}
            hasPaid={paidCents > 0}
          />
        )
      )}

      <p className="mt-6 text-sm text-ink-500">
        To amend this booking, contact bookings@playhousecompany.com quoting your
        reference.
      </p>
      </div>
    </>
  );
}
