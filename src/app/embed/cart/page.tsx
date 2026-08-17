import Link from "next/link";
import { removeFromCartAction } from "@/app/actions/cart";
import { BreakoutLink } from "@/components/EmbedAutoResize";
import { HoldCountdown } from "@/components/HoldCountdown";
import { Alert, EmptyState } from "@/components/ui";
import { findCart, getCartView } from "@/lib/cart";
import { env } from "@/lib/env";
import { formatCents } from "@/lib/money";
import { formatRange } from "@/lib/time";

export const dynamic = "force-dynamic";

export const metadata = { title: "Your selection" };

export default async function EmbedCartPage() {
  const cart = await findCart();
  const view = cart ? await getCartView(cart.id) : null;

  if (!view || view.lines.length === 0) {
    return (
      <EmptyState title="Nothing selected yet">
        <Link href="/embed" className="text-brand-600 underline">
          Browse venues
        </Link>
      </EmptyState>
    );
  }

  return (
    <div>
      <h1 className="mb-3 text-xl">Your selection</h1>

      {view.expiresAt && (
        <HoldCountdown
          expiresAt={view.expiresAt.toISOString()}
          initialRemainingMs={view.expiresInMs}
        />
      )}

      <div className="mt-4 border border-parchment-300 bg-white">
        {view.lines.map((line) => (
          <div
            key={line.id}
            className="flex flex-wrap items-start justify-between gap-3 border-b border-parchment-200 p-3 last:border-0"
          >
            <div>
              <p className="font-medium">{line.venueName}</p>
              <p className="text-sm text-ink-500">
                {formatRange(line.startsAt, line.endsAt, line.timezone)}
              </p>
              {line.requiresApproval && (
                <p className="text-xs text-amber-800">Subject to approval</p>
              )}
            </div>
            <div className="text-right">
              <p className="tabular">
                {formatCents(line.lineTotalCents, line.currency)}
              </p>
              <form action={removeFromCartAction}>
                <input type="hidden" name="reservationId" value={line.id} />
                <button
                  type="submit"
                  className="text-xs text-ink-500 underline hover:text-red-700"
                >
                  Remove
                </button>
              </form>
            </div>
          </div>
        ))}

        <div className="flex items-center justify-between bg-parchment-100 px-3 py-3">
          <span>Subtotal</span>
          <span className="tabular text-lg font-semibold">
            {formatCents(view.subtotalCents, view.currency)}
          </span>
        </div>
      </div>

      <div className="mt-4">
        <Alert tone="info">
          Checkout opens in the full booking portal. Payment providers do not permit
          their secure payment pages to be displayed inside another website.
        </Alert>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <Link href="/embed" className="text-sm text-brand-600 underline">
          ← Add another venue
        </Link>
        <BreakoutLink
          href={`${env.APP_URL}/checkout`}
          className="bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
        >
          Continue to secure checkout →
        </BreakoutLink>
      </div>
    </div>
  );
}
