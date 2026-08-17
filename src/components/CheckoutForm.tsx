"use client";

import Link from "next/link";
import { useActionState } from "react";
import { checkoutAction, type CheckoutState } from "@/app/actions/checkout";
import { GatewayOptions, type GatewayChoice } from "@/components/GatewayOptions";
import { Alert, Button, Field, inputClass } from "@/components/ui";

const initialState: CheckoutState = { ok: true };

export type { GatewayChoice };

export function CheckoutForm({
  signedIn,
  defaults,
  deposit,
  gateways,
  gatewayError,
}: {
  signedIn: boolean;
  defaults: { contactName: string; contactEmail: string };
  deposit: {
    percent: number;
    /** The whole booking value, so both choices state their amount. */
    totalLabel: string;
    amountLabel: string;
    balanceLabel: string;
  } | null;
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

            <div className="mt-4">
              <GatewayOptions gateways={gateways} />
            </div>

            {/* Presented as a choice rather than an opt-in checkbox. Paying in
                full was previously the unlabelled default and the deposit an
                easily missed tick, so a customer entitled to pay a deposit
                could reach the gateway owing the whole amount without ever
                having seen the option. */}
            {deposit && (
              <fieldset className="mt-4">
                <legend className="text-sm font-medium text-ink-900">
                  How much would you like to pay now?
                </legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <label className="flex cursor-pointer items-start gap-3 border border-parchment-300 bg-white p-3 has-checked:border-brand-600 has-checked:bg-brand-50">
                    <input
                      type="radio"
                      name="paymentAmount"
                      value="full"
                      defaultChecked
                      className="mt-1 h-4 w-4 accent-[#8a1538]"
                    />
                    <span className="text-sm">
                      <span className="font-medium text-ink-900">
                        Pay in full, {deposit.totalLabel}
                      </span>
                      <span className="mt-0.5 block text-ink-500">
                        Nothing further to settle before the event.
                      </span>
                    </span>
                  </label>

                  <label className="flex cursor-pointer items-start gap-3 border border-parchment-300 bg-white p-3 has-checked:border-brand-600 has-checked:bg-brand-50">
                    <input
                      type="radio"
                      name="paymentAmount"
                      value="deposit"
                      className="mt-1 h-4 w-4 accent-[#8a1538]"
                    />
                    <span className="text-sm">
                      <span className="font-medium text-ink-900">
                        Pay a {deposit.percent}% deposit, {deposit.amountLabel}
                      </span>
                      <span className="mt-0.5 block text-ink-500">
                        The balance of {deposit.balanceLabel} is payable before the
                        event, from your booking page.
                      </span>
                    </span>
                  </label>
                </div>
              </fieldset>
            )}

            <label className="mt-4 flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                name="acceptTerms"
                required
                className="mt-1 h-4 w-4 accent-[#8a1538]"
              />
              <span className="text-sm text-ink-700">
                I accept The Playhouse Company&apos;s{" "}
                <Link
                  href="/conditions-of-hire"
                  target="_blank"
                  className="text-brand-600 underline"
                >
                  conditions of hire
                </Link>
                , including the cancellation and refund policy.
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
