"use client";

import { useActionState } from "react";
import {
  approveBookingAction,
  cancelBookingAction,
  recordPaymentAction,
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
