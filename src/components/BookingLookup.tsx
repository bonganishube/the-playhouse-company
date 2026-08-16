"use client";

import { useActionState } from "react";
import { lookupBookingAction, type LookupState } from "@/app/actions/lookup";
import { Alert, Button, Card, Field, StatusBadge, inputClass } from "@/components/ui";

const initialState: LookupState = { ok: true };

export function BookingLookup() {
  const [state, formAction, pending] = useActionState(lookupBookingAction, initialState);

  return (
    <>
      <form action={formAction} className="space-y-4 border border-parchment-300 bg-white p-5">
        <Field label="Booking reference" required>
          <input
            name="reference"
            required
            placeholder="PHC-2026-000123"
            className={`${inputClass} font-mono uppercase`}
          />
        </Field>
        <Field label="Email address" required>
          <input type="email" name="email" required className={inputClass} />
        </Field>
        <Button type="submit" disabled={pending}>
          {pending ? "Searching…" : "Find my booking"}
        </Button>
      </form>

      {state.message && !state.ok && (
        <div className="mt-4">
          <Alert tone="error">{state.message}</Alert>
        </div>
      )}

      {state.booking && (
        <Card className="mt-6 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-mono text-lg">{state.booking.reference}</p>
              <p className="text-sm text-ink-500">{state.booking.contactName}</p>
            </div>
            <StatusBadge status={state.booking.status} />
          </div>

          {state.booking.eventTitle && (
            <p className="mt-3 text-sm">
              <span className="text-ink-500">Event: </span>
              {state.booking.eventTitle}
            </p>
          )}

          <ul className="mt-4 divide-y divide-parchment-200 border-y border-parchment-200">
            {state.booking.lines.map((line, index) => (
              <li key={index} className="flex justify-between gap-4 py-2 text-sm">
                <span>
                  <span className="block font-medium">{line.venue}</span>
                  <span className="text-ink-500">{line.when}</span>
                </span>
                <span className="tabular whitespace-nowrap">
                  {money(line.amount, state.booking!.currency)}
                </span>
              </li>
            ))}
          </ul>

          <dl className="mt-4 space-y-1 text-sm">
            <Row label="Total" value={money(state.booking.totalCents, state.booking.currency)} />
            <Row label="Paid" value={money(state.booking.paidCents, state.booking.currency)} />
            {state.booking.outstandingCents > 0 && (
              <Row
                label="Outstanding"
                value={money(state.booking.outstandingCents, state.booking.currency)}
                emphasis
              />
            )}
          </dl>

          <p className="mt-4 text-xs text-ink-500">
            For changes or cancellations, contact bookings@playhousecompany.com quoting
            your reference.
          </p>
        </Card>
      )}
    </>
  );
}

function Row({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-ink-500">{label}</dt>
      <dd className={`tabular ${emphasis ? "font-semibold text-brand-700" : ""}`}>
        {value}
      </dd>
    </div>
  );
}

function money(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency }).format(
    cents / 100,
  );
}
