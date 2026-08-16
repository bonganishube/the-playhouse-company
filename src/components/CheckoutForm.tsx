"use client";

import Link from "next/link";
import { useActionState } from "react";
import { checkoutAction, type CheckoutState } from "@/app/actions/checkout";
import { Alert, Button, Field, inputClass } from "@/components/ui";

const initialState: CheckoutState = { ok: true };

export type GatewayChoice = {
  id: string;
  name: string;
  summary: string;
  available: boolean;
  unavailableReason?: string;
  active: boolean;
};

export function CheckoutForm({
  signedIn,
  defaults,
  deposit,
  gateways,
  gatewayError,
}: {
  signedIn: boolean;
  defaults: { contactName: string; contactEmail: string };
  deposit: { percent: number; amountLabel: string; balanceLabel: string } | null;
  gateways: GatewayChoice[];
  gatewayError: string | null;
}) {
  const [state, formAction, pending] = useActionState(checkoutAction, initialState);

  return (
    <form action={formAction} className="space-y-6">
      <fieldset className="border border-parchment-300 bg-white p-5">
        <legend className="px-2 font-display text-lg">Contact details</legend>

        {!signedIn && (
          <p className="mb-4 text-sm text-ink-500">
            Already have an account?{" "}
            <Link href="/signin?next=/checkout" className="text-brand-600 underline">
              Sign in
            </Link>{" "}
            to use your saved details.
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" required>
            <input
              name="contactName"
              defaultValue={defaults.contactName}
              required
              autoComplete="name"
              className={inputClass}
            />
          </Field>
          <Field label="Email address" required>
            <input
              type="email"
              name="contactEmail"
              defaultValue={defaults.contactEmail}
              required
              readOnly={signedIn}
              autoComplete="email"
              className={`${inputClass} ${signedIn ? "bg-parchment-100" : ""}`}
            />
          </Field>
          <Field label="Telephone" required>
            <input
              name="contactPhone"
              required
              autoComplete="tel"
              placeholder="031 369 9540"
              className={inputClass}
            />
          </Field>
          <Field label="Organisation" hint="If booking on behalf of a company or school">
            <input name="organisation" autoComplete="organization" className={inputClass} />
          </Field>
        </div>
      </fieldset>

      <fieldset className="border border-parchment-300 bg-white p-5">
        <legend className="px-2 font-display text-lg">About your event</legend>
        <div className="space-y-4">
          <Field label="Event title" hint="Appears on the venue schedule and your confirmation">
            <input
              name="eventTitle"
              placeholder="Annual Awards Evening"
              className={inputClass}
            />
          </Field>
          <Field
            label="Nature of the event"
            hint="Helps our team prepare the venue appropriately"
          >
            <textarea name="purpose" rows={3} className={inputClass} />
          </Field>
        </div>
      </fieldset>

      <fieldset className="border border-parchment-300 bg-white p-5">
        <legend className="px-2 font-display text-lg">Payment</legend>

        {gatewayError ? (
          <Alert tone="error" title="Payment is currently unavailable">
            {gatewayError}
          </Alert>
        ) : (
          <>
            <p className="text-sm text-ink-500">
              You will be redirected to complete payment securely. The Playhouse
              Company does not store your card details.
            </p>

            {/* The providers named in the tender are listed even before their
                merchant accounts exist, shown as unavailable rather than
                hidden. The choice is presentational: the server decides which
                gateway a payment goes to, so a tampered form cannot redirect a
                customer to a provider that is not live. */}
            <fieldset className="mt-4">
              <legend className="sr-only">Payment method</legend>
              <ul className="space-y-2">
                {gateways.map((gateway) => (
                  <li key={gateway.id}>
                    <label
                      className={`flex items-start gap-3 border p-3 ${
                        gateway.available
                          ? "cursor-pointer border-brand-600 bg-brand-50"
                          : "cursor-not-allowed border-parchment-300 bg-parchment-100 opacity-70"
                      }`}
                    >
                      <input
                        type="radio"
                        name="gatewayPreference"
                        value={gateway.id}
                        defaultChecked={gateway.available}
                        disabled={!gateway.available}
                        className="mt-1 h-4 w-4 accent-[#8a1538]"
                      />
                      <span className="min-w-0 flex-1 text-sm">
                        <span className="flex flex-wrap items-center gap-x-2">
                          <span className="font-medium text-ink-900">
                            {gateway.name}
                          </span>
                          {gateway.available ? (
                            <span className="text-xs font-semibold text-green-800">
                              Available
                            </span>
                          ) : (
                            <span className="text-xs text-ink-500">
                              {gateway.unavailableReason}
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 block text-ink-500">
                          {gateway.summary}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-ink-500">
                Further providers become selectable once The Playhouse Company&apos;s
                merchant accounts are in place.
              </p>
            </fieldset>

            {deposit && (
              <label className="mt-4 flex cursor-pointer items-start gap-3 border border-parchment-300 bg-parchment-50 p-3">
                <input
                  type="checkbox"
                  name="payDeposit"
                  className="mt-1 h-4 w-4 accent-[#8a1538]"
                />
                <span className="text-sm">
                  <span className="font-medium">
                    Pay a {deposit.percent}% deposit of {deposit.amountLabel} now
                  </span>
                  <span className="mt-0.5 block text-ink-500">
                    The balance of {deposit.balanceLabel} becomes payable before the
                    event. Our finance team will contact you to arrange settlement.
                  </span>
                </span>
              </label>
            )}

            <label className="mt-4 flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                name="acceptTerms"
                required
                className="mt-1 h-4 w-4 accent-[#8a1538]"
              />
              <span className="text-sm text-ink-700">
                I accept The Playhouse Company&apos;s conditions of hire, including the
                cancellation and refund policy.
              </span>
            </label>
          </>
        )}
      </fieldset>

      {state.message && !state.ok && <Alert tone="error">{state.message}</Alert>}

      <Button type="submit" disabled={pending || Boolean(gatewayError)} className="w-full sm:w-auto">
        {pending ? "Creating your booking…" : "Confirm and pay"}
      </Button>
    </form>
  );
}
