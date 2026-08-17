"use client";

import { useActionState } from "react";
import {
  approveBookingAction,
  cancelBookingAction,
  declineCancellationAction,
  recordPaymentAction,
  refundPaymentAction,
  rejectBookingAction,
  requestBalanceAction,
  type AdminState,
} from "@/app/actions/admin";
import { Alert, Button, Card, Field, inputClass } from "@/components/ui";

const initial: AdminState = { ok: true };

export function ApprovalPanel({ bookingId }: { bookingId: string }) {
  const [approveState, approve, approving] = useActionState(
    approveBookingAction,
    initial,
  );
  const [rejectState, reject, rejecting] = useActionState(
    rejectBookingAction,
    initial,
  );

  return (
    <Card className="border-l-4 border-l-amber-500 p-5">
      <h2 className="text-lg">Approval required</h2>
      <p className="mt-1 text-sm text-ink-500">
        Payment has cleared and the dates are held. Approving finalises the booking,
        writes it to the venue calendar and notifies the customer.
      </p>

      <div className="mt-4 flex flex-wrap gap-3">
        <form action={approve}>
          <input type="hidden" name="bookingId" value={bookingId} />
          <Button type="submit" disabled={approving}>
            {approving ? "Approving…" : "Approve booking"}
          </Button>
        </form>
      </div>

      <details className="mt-4">
        <summary className="cursor-pointer text-sm text-ink-700">
          Decline this booking
        </summary>
        <form action={reject} className="mt-3 space-y-3">
          <input type="hidden" name="bookingId" value={bookingId} />
          <Field
            label="Reason"
            required
            hint="Shared with the customer in the notification email."
          >
            <textarea
              name="reason"
              rows={2}
              required
              className={inputClass}
              placeholder="The venue is committed to a production on these dates."
            />
          </Field>
          <Button type="submit" variant="danger" size="sm" disabled={rejecting}>
            {rejecting ? "Declining…" : "Decline and refund"}
          </Button>
        </form>
      </details>

      {approveState.message && (
        <div className="mt-3">
          <Alert tone={approveState.ok ? "success" : "error"}>
            {approveState.message}
          </Alert>
        </div>
      )}
      {rejectState.message && (
        <div className="mt-3">
          <Alert tone={rejectState.ok ? "success" : "error"}>
            {rejectState.message}
          </Alert>
        </div>
      )}
    </Card>
  );
}

export function PaymentPanel({
  bookingId,
  outstandingLabel,
  outstandingAmount,
  canRequestBalance,
}: {
  bookingId: string;
  outstandingLabel: string;
  outstandingAmount: number;
  canRequestBalance: boolean;
}) {
  const [recordState, record, recording] = useActionState(
    recordPaymentAction,
    initial,
  );
  const [balanceState, requestBalance, requesting] = useActionState(
    requestBalanceAction,
    initial,
  );

  return (
    <Card className="p-5">
      <h2 className="text-lg">Record a payment</h2>
      <p className="mt-1 text-sm text-ink-500">
        For funds received outside the online gateways, typically an EFT against the
        outstanding balance of {outstandingLabel}.
      </p>

      <form action={record} className="mt-4 space-y-3">
        <input type="hidden" name="bookingId" value={bookingId} />
        <Field label="Amount received (ZAR)" required>
          <input
            type="number"
            name="amount"
            step="0.01"
            min="0.01"
            max={(outstandingAmount / 100).toFixed(2)}
            defaultValue={(outstandingAmount / 100).toFixed(2)}
            required
            className={inputClass}
          />
        </Field>
        <Field label="Note" hint="Bank reference or remittance detail">
          <input name="note" className={inputClass} />
        </Field>
        <Button type="submit" size="sm" disabled={recording}>
          {recording ? "Recording…" : "Record payment and issue receipt"}
        </Button>
      </form>

      {canRequestBalance && (
        <form action={requestBalance} className="mt-4 border-t border-parchment-200 pt-4">
          <input type="hidden" name="bookingId" value={bookingId} />
          <p className="mb-2 text-sm text-ink-500">
            This booking was taken on a deposit. Calling in the balance makes the full
            amount payable and shows it as due on the customer&apos;s booking page.
          </p>
          <Button type="submit" variant="secondary" size="sm" disabled={requesting}>
            {requesting ? "Updating…" : "Call in the outstanding balance"}
          </Button>
        </form>
      )}

      {recordState.message && (
        <div className="mt-3">
          <Alert tone={recordState.ok ? "success" : "error"}>{recordState.message}</Alert>
        </div>
      )}
      {balanceState.message && (
        <div className="mt-3">
          <Alert tone={balanceState.ok ? "success" : "error"}>
            {balanceState.message}
          </Alert>
        </div>
      )}
    </Card>
  );
}

/**
 * A customer has asked to cancel a booking they have paid for.
 *
 * Nothing has happened yet: the venue is still held and no refund has been
 * made. Approving reuses the ordinary cancellation, so the outcome is
 * identical however a cancellation was prompted.
 */
export function CancellationRequestPanel({
  bookingId,
  requestedAt,
  reason,
  refundableLabel,
}: {
  bookingId: string;
  requestedAt: string;
  reason: string;
  refundableLabel: string;
}) {
  const [approveState, approve, approving] = useActionState(
    cancelBookingAction,
    initial,
  );
  const [declineState, decline, declining] = useActionState(
    declineCancellationAction,
    initial,
  );

  return (
    <Card className="border-l-4 border-l-amber-500 p-5">
      <h2 className="text-lg">Cancellation requested</h2>
      <p className="mt-1 text-sm text-ink-500">
        Received {requestedAt}. The venue is still held and no refund has been
        made.
      </p>
      <p className="mt-3 rounded-sm bg-parchment-100 p-3 text-sm text-ink-900">
        {reason}
      </p>
      <p className="mt-3 text-sm text-ink-700">
        Approving releases the dates and marks{" "}
        <strong>{refundableLabel}</strong> as refundable. The refund itself is
        processed through the merchant account.
      </p>

      <form action={approve} className="mt-4 space-y-3">
        <input type="hidden" name="bookingId" value={bookingId} />
        <Field label="Cancellation reason for the record" required>
          <input
            name="reason"
            required
            defaultValue="Cancelled at the customer's request."
            className={inputClass}
          />
        </Field>
        <Button type="submit" variant="danger" size="sm" disabled={approving}>
          {approving ? "Cancelling…" : "Approve and cancel the booking"}
        </Button>
      </form>

      <details className="mt-4 border-t border-parchment-200 pt-4">
        <summary className="cursor-pointer text-sm text-ink-700">
          Decline the request
        </summary>
        <form action={decline} className="mt-3 space-y-3">
          <input type="hidden" name="bookingId" value={bookingId} />
          <Field
            label="Reason"
            required
            hint="Shared with the customer."
          >
            <textarea name="reason" rows={2} required className={inputClass} />
          </Field>
          <Button type="submit" variant="secondary" size="sm" disabled={declining}>
            {declining ? "Declining…" : "Decline and keep the booking"}
          </Button>
        </form>
      </details>

      {approveState.message && (
        <div className="mt-3">
          <Alert tone={approveState.ok ? "success" : "error"}>
            {approveState.message}
          </Alert>
        </div>
      )}
      {declineState.message && (
        <div className="mt-3">
          <Alert tone={declineState.ok ? "success" : "error"}>
            {declineState.message}
          </Alert>
        </div>
      )}
    </Card>
  );
}

export function CancelPanel({ bookingId }: { bookingId: string }) {
  const [state, cancel, pending] = useActionState(cancelBookingAction, initial);

  return (
    <Card className="p-5">
      <h2 className="text-lg">Cancel this booking</h2>
      <p className="mt-1 text-sm text-ink-500">
        Releases the venue slots for other customers, removes the entry from the
        Outlook calendar and notifies the customer. Any refund is processed separately
        through the merchant account.
      </p>

      <form action={cancel} className="mt-4 space-y-3">
        <input type="hidden" name="bookingId" value={bookingId} />
        <Field label="Reason" required>
          <textarea name="reason" rows={2} required className={inputClass} />
        </Field>
        <Button type="submit" variant="danger" size="sm" disabled={pending}>
          {pending ? "Cancelling…" : "Cancel booking"}
        </Button>
      </form>

      {state.message && (
        <div className="mt-3">
          <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert>
        </div>
      )}
    </Card>
  );
}

/**
 * Issue a refund against a single payment.
 *
 * Kept behind a disclosure rather than sitting open on the page: sending money
 * back is not a routine click, and the extra step makes it deliberate. The
 * amount defaults to everything still refundable, which is the common case,
 * but a partial refund is typed in directly.
 */
export function RefundPanel({
  paymentId,
  refundableLabel,
  refundableAmount,
  supportsAutomatic,
  gatewayName,
}: {
  paymentId: string;
  refundableLabel: string;
  refundableAmount: string;
  supportsAutomatic: boolean;
  gatewayName: string;
}) {
  const [state, action, pending] = useActionState(refundPaymentAction, initial);

  if (state.ok && state.message) {
    return (
      <div className="mt-2">
        <Alert tone="success">{state.message}</Alert>
      </div>
    );
  }

  return (
    <details className="mt-2 border border-parchment-300 bg-parchment-50 p-3">
      <summary className="cursor-pointer text-xs font-medium text-ink-700">
        Refund this payment
      </summary>

      <p className="mt-2 text-xs text-ink-500">
        {supportsAutomatic
          ? `${refundableLabel} can be refunded through ${gatewayName}.`
          : `${gatewayName} has no refund API, so this records the refund and finance moves the money.`}
      </p>

      <form action={action} className="mt-3 space-y-3">
        <input type="hidden" name="paymentId" value={paymentId} />

        <Field label="Amount" required hint="Defaults to everything still refundable">
          <input
            name="amount"
            type="number"
            step="0.01"
            min="0.01"
            max={refundableAmount}
            defaultValue={refundableAmount}
            required
            className={inputClass}
          />
        </Field>

        <Field label="Reason" required hint="Recorded on the payment and shown to the customer">
          <input
            name="reason"
            required
            placeholder="Booking not approved"
            className={inputClass}
          />
        </Field>

        {supportsAutomatic && (
          <label className="flex cursor-pointer items-start gap-2 text-xs text-ink-700">
            <input type="checkbox" name="manual" className="mt-0.5 h-3.5 w-3.5 accent-[#8a1538]" />
            <span>
              Record only. Tick if the money has already been returned another way, so the
              provider is not asked to refund it a second time.
            </span>
          </label>
        )}

        {state.message && !state.ok && <Alert tone="error">{state.message}</Alert>}

        <Button type="submit" variant="danger" size="sm" disabled={pending}>
          {pending ? "Processing…" : "Issue refund"}
        </Button>
      </form>
    </details>
  );
}
