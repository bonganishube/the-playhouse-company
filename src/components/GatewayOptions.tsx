"use client";

export type GatewayChoice = {
  id: string;
  name: string;
  summary: string;
  available: boolean;
  unavailableReason?: string;
  active: boolean;
};

/**
 * The payment providers a customer can be offered.
 *
 * Shared by checkout and by settling an outstanding balance, so the two show
 * the same providers in the same order. Someone who paid a deposit through one
 * list and returned later to pay the balance through a different one would
 * reasonably wonder which of the two was real.
 *
 * The providers named in the tender are listed even before their merchant
 * accounts exist, shown as unavailable rather than hidden. The choice is
 * presentational: the server decides which gateway a payment goes to, so a
 * tampered form cannot redirect a customer to a provider that is not live.
 */
export function GatewayOptions({ gateways }: { gateways: GatewayChoice[] }) {
  return (
    <fieldset>
      <legend className="sr-only">Payment method</legend>
      {/* Two abreast once there is room. Five providers stacked singly pushes
          the pay button well below the fold on the balance screen. */}
      <ul className="grid gap-2 sm:grid-cols-2">
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
                  <span className="font-medium text-ink-900">{gateway.name}</span>
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
                <span className="mt-0.5 block text-ink-500">{gateway.summary}</span>
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
  );
}
