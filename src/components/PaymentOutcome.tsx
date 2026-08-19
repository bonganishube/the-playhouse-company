import { PageHero } from "@/components/PageHero";
import { PaymentReconciler } from "@/components/PaymentReconciler";
import { Alert, ButtonLink, Card, DetailRow } from "@/components/ui";
import { formatCents } from "@/lib/money";
import { formatDateTime } from "@/lib/time";

export type PaymentOutcomeProps = {
  bookingReference: string;
  /** Null when the customer arrived before any attempt was recorded. */
  payment: {
    status: string;
    amountCents: number;
    currency: string;
    receiptNumber: string | null;
    failureReason: string | null;
    at: Date;
  } | null;
  /** Still owed on the booking, in cents. */
  outstandingCents: number;
  bookingCurrency: string;
  /** Proof of the payment, so retrying does not demand a sign-in either. */
  token: string;
};

/**
 * What became of a payment, for a customer who has no session.
 *
 * Deliberately narrower than the booking page. It answers the one question
 * someone returning from a payment provider actually has, and offers a way
 * back in for the rest, without disclosing the contact details, the venues or
 * the event of a booking whose reference anyone could have guessed.
 *
 * The signed-in view is unchanged and remains the fuller one.
 */
export function PaymentOutcome({
  bookingReference,
  payment,
  outstandingCents,
  bookingCurrency,
  token,
}: PaymentOutcomeProps) {
  const succeeded = payment?.status === "SUCCEEDED";
  const failed = payment?.status === "FAILED" || payment?.status === "CANCELLED";
  const signIn = `/signin?next=${encodeURIComponent(`/booking/${bookingReference}`)}`;

  return (
    <>
      <PageHero eyebrow="Booking reference" title={bookingReference} />

      <div className="mx-auto max-w-lg px-4 py-10">
        {succeeded && (
          <Alert tone="success" title="Payment successful">
            We have received{" "}
            {formatCents(payment.amountCents, payment.currency)}. A receipt and,
            once your booking is confirmed, a calendar invitation have been sent
            to the email address you gave at checkout.
          </Alert>
        )}

        {failed && (
          <Alert tone="error" title="Your payment did not go through">
            {payment.status === "CANCELLED"
              ? "The payment was cancelled before it completed, so you have not been charged."
              : "The payment was declined by the provider, so you have not been charged."}
            {payment.failureReason ? ` ${payment.failureReason}` : ""} Your dates
            are held for a short period and you can try again below.
          </Alert>
        )}

        {!succeeded && !failed && (
          <Alert tone="info" title="Confirming your payment">
            We are confirming your payment with the provider. This page updates
            automatically as soon as we know the outcome.
            <PaymentReconciler reference={bookingReference} token={token} />
          </Alert>
        )}

        {payment && (
          <Card className="mt-6 p-5">
            <h2 className="mb-2 text-lg">Your payment</h2>
            <dl>
              <DetailRow label="Amount">
                <span className="tabular">
                  {formatCents(payment.amountCents, payment.currency)}
                </span>
              </DetailRow>
              <DetailRow label="Date">{formatDateTime(payment.at)}</DetailRow>
              {payment.receiptNumber && (
                <DetailRow label="Receipt">
                  <span className="font-mono text-xs">{payment.receiptNumber}</span>
                </DetailRow>
              )}
              {outstandingCents > 0 && (
                <DetailRow label="Still outstanding">
                  <span className="tabular">
                    {formatCents(outstandingCents, bookingCurrency)}
                  </span>
                </DetailRow>
              )}
            </dl>
          </Card>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          {failed && outstandingCents > 0 && (
            <ButtonLink href={`/checkout/redirect/${bookingReference}?t=${token}`}>
              Try payment again
            </ButtonLink>
          )}
          <ButtonLink href={signIn} variant="secondary">
            Sign in to view your booking
          </ButtonLink>
        </div>

        {/* The account exists whether or not they have ever used it: checkout
            creates one, so "sign in" is not a dead end even for a guest. */}
        <p className="mt-4 text-sm text-ink-500">
          An account was created for you at checkout. If you have not set a
          password, use{" "}
          <a href="/forgot-password" className="text-brand-600 underline">
            forgot password
          </a>{" "}
          with the email address you booked under. For anything else, contact
          bookings@playhousecompany.com quoting {bookingReference}.
        </p>
      </div>
    </>
  );
}
