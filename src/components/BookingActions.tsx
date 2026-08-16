"use client";

import { useActionState } from "react";
import {
  payBalanceAction,
  requestCancellationAction,
  type BookingActionState,
} from "@/app/actions/booking";
import { Alert, Button, Field, inputClass } from "@/components/ui";

const initial: BookingActionState = { ok: true };

/** Settle the remainder owed on a booking that is already confirmed. */
export function PayBalance({
  reference,
  outstandingLabel,
}: {
  reference: string;
  outstandingLabel: string;
}) {
  const [state, action, pending] = useActionState(payBalanceAction, initial);

  return (
    <div className="mt-4 border-t border-parchment-200 pt-4">
      <form action={action}>
        <input type="hidden" name="reference" value={reference} />
        <Button type="submit" disabled={pending}>
          {pending ? "Opening payment…" : `Pay balance of ${outstandingLabel}`}
        </Button>
      </form>
      {state.message && !state.ok && (
        <div className="mt-3">
          <Alert tone="error">{state.message}</Alert>
        </div>
      )}
    </div>
  );
}

/**
 * Cancellation.
 *
 * The wording differs by whether money has been taken, because the outcome
 * genuinely differs: an unpaid booking ends immediately, a paid one goes to
 * staff for review. Promising an immediate cancellation and then not
 * delivering one would be worse than saying so plainly here.
 */
export function CancelBooking({
  reference,
  hasPaid,
}: {
  reference: string;
  hasPaid: boolean;
}) {
  const [state, action, pending] = useActionState(
    requestCancellationAction,
    initial,
  );

  if (state.ok && state.message) {
    return (
      <div className="mt-6">
        <Alert tone="success">{state.message}</Alert>
      </div>
    );
  }

  return (
    <details className="mt-6 border border-parchment-300 bg-white p-5">
      <summary className="cursor-pointer text-sm font-medium text-ink-700">
        {hasPaid ? "Request to cancel this booking" : "Cancel this booking"}
      </summary>

      <p className="mt-3 text-sm text-ink-500">
        {hasPaid
          ? "Because payment has been made, your request is reviewed against our conditions of hire before the booking is released or any refund is made. We will write to you once a decision has been taken."
          : "No payment has been taken, so this booking will be cancelled straight away and the dates released."}
      </p>

      <form action={action} className="mt-4 space-y-3">
        <input type="hidden" name="reference" value={reference} />
        <Field label="Reason" required>
          <textarea
            name="reason"
            rows={3}
            required
            className={inputClass}
            placeholder="Our event has been postponed."
          />
        </Field>
        <Button type="submit" variant="danger" size="sm" disabled={pending}>
          {pending
            ? "Submitting…"
            : hasPaid
              ? "Submit cancellation request"
              : "Cancel booking"}
        </Button>
      </form>

      {state.message && !state.ok && (
        <div className="mt-3">
          <Alert tone="error">{state.message}</Alert>
        </div>
      )}
    </details>
  );
}
